import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { Pool, type PoolClient } from "pg";

type AuditResult = "current" | "past" | "missing";
type User = { id: string; displayName: string; email: string; isGodAdmin: boolean; isLocationManager: boolean; canAudit: boolean };
type AuthenticatedRequest = Request & { auditor: User; token: string };

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sectionIds = ["safety", "opening", "mid", "closing", "cooler", "two-hour", "protein", "test"];
const allowedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || process.env.NODE_ENV !== "production" || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("This browser origin is not permitted."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
const authed = (request: Request) => request as AuthenticatedRequest;
const userFromRow = (row: Record<string, unknown>): User => ({
  id: String(row.id), displayName: String(row.display_name), email: String(row.email),
  isGodAdmin: Boolean(row.is_god_admin), isLocationManager: Boolean(row.is_location_manager), canAudit: Boolean(row.can_audit)
});

async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return response.status(401).json({ error: "Sign in is required." });
  const { rows } = await pool.query(
    `SELECT a.id, a.display_name, a.email, a.is_god_admin, a.is_location_manager, a.can_audit
       FROM auth_sessions s JOIN auditors a ON a.id = s.auditor_id
      WHERE s.token = $1 AND s.expires_at > now() AND a.active = true`, [token]
  );
  if (!rows[0]) return response.status(401).json({ error: "Your session has expired. Please sign in again." });
  authed(request).token = token;
  authed(request).auditor = userFromRow(rows[0]);
  next();
}

function requireGodAdmin(request: Request, response: Response, next: NextFunction) {
  if (!authed(request).auditor.isGodAdmin) return response.status(403).json({ error: "Only God Admins can manage auditors and locations." });
  next();
}

function requireLocationManager(request: Request, response: Response, next: NextFunction) {
  const auditor = authed(request).auditor;
  if (!auditor.isGodAdmin && !auditor.isLocationManager) return response.status(403).json({ error: "Only God Admins, Chuck, and Ken can assign locations." });
  next();
}

async function withTransaction<T>(action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await action(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

app.get("/health", async (_request, response) => { await pool.query("SELECT 1"); response.json({ status: "ok" }); });

app.get("/auth/test-accounts", async (_request, response) => {
  const { rows } = await pool.query("SELECT email, display_name, is_god_admin, is_location_manager FROM auditors WHERE active = true ORDER BY display_name");
  response.json(rows.map((row) => ({ email: row.email, displayName: row.display_name, isGodAdmin: row.is_god_admin, isLocationManager: row.is_location_manager })));
});

app.post("/auth/login", async (request, response) => {
  const { email, password } = request.body as { email?: string; password?: string };
  if (!email?.toLowerCase().endsWith("@compass-usa.com") || !password) return response.status(400).json({ error: "Use a Compass email address and password." });
  const { rows } = await pool.query(
    `SELECT id, display_name, email, is_god_admin, is_location_manager, can_audit FROM auditors
      WHERE lower(email) = lower($1) AND active = true AND password_hash = crypt($2, password_hash)`, [email.trim(), password]
  );
  if (!rows[0]) return response.status(401).json({ error: "Email or password is not recognized." });
  const session = await pool.query("INSERT INTO auth_sessions (auditor_id) VALUES ($1) RETURNING token", [rows[0].id]);
  response.json({ token: session.rows[0].token, auditor: userFromRow(rows[0]) });
});

app.post("/auth/logout", requireAuth, async (request, response) => { await pool.query("DELETE FROM auth_sessions WHERE token = $1", [authed(request).token]); response.status(204).end(); });

app.get("/locations", requireAuth, async (_request, response) => {
  const { rows } = await pool.query(
    `SELECT l.id, l.area_name, l.location_name, l.owner_auditor_id, owner.display_name AS owner_name,
            coalesce(json_agg(json_build_object('id', b.id, 'binderName', b.binder_name) ORDER BY b.binder_name) FILTER (WHERE b.id IS NOT NULL), '[]') AS binders
       FROM locations l LEFT JOIN auditors owner ON owner.id = l.owner_auditor_id LEFT JOIN binders b ON b.location_id = l.id
      WHERE l.active = true GROUP BY l.id, owner.display_name ORDER BY l.area_name, l.location_name`
  );
  response.json(rows.map((row) => ({ id: row.id, areaName: row.area_name, locationName: row.location_name, ownerAuditorId: row.owner_auditor_id, ownerName: row.owner_name ?? "Unassigned", binders: row.binders })));
});

app.post("/locations", requireAuth, requireGodAdmin, async (request, response) => {
  const { areaName, locationName, binderName, ownerAuditorId } = request.body as { areaName?: string; locationName?: string; binderName?: string; ownerAuditorId?: string };
  if (!areaName?.trim() || !locationName?.trim() || !binderName?.trim()) return response.status(400).json({ error: "Area, location, and binder are required." });
  const location = await withTransaction(async (client) => {
    const created = await client.query("INSERT INTO locations (area_name, location_name, owner_auditor_id) VALUES ($1, $2, $3) RETURNING id", [areaName.trim(), locationName.trim(), ownerAuditorId || null]);
    await client.query("INSERT INTO binders (location_id, binder_name) VALUES ($1, $2)", [created.rows[0].id, binderName.trim()]);
    return created.rows[0];
  });
  response.status(201).json(location);
});

app.patch("/locations/:locationId/owner", requireAuth, requireLocationManager, async (request, response) => {
  const { ownerAuditorId } = request.body as { ownerAuditorId?: string | null };
  if (ownerAuditorId) {
    const recipient = await pool.query("SELECT id FROM auditors WHERE id = $1 AND active = true AND can_audit = true", [ownerAuditorId]);
    if (!recipient.rows[0]) return response.status(400).json({ error: "Choose an active auditor as the location owner." });
  }
  const { rows } = await pool.query("UPDATE locations SET owner_auditor_id = $1 WHERE id = $2 AND active = true RETURNING id", [ownerAuditorId || null, request.params.locationId]);
  if (!rows[0]) return response.status(404).json({ error: "Location not found." });
  response.status(204).end();
});

app.get("/auditors", requireAuth, async (_request, response) => {
  const { rows } = await pool.query("SELECT id, display_name, email FROM auditors WHERE active = true AND can_audit = true ORDER BY display_name");
  response.json(rows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, canAudit: true })));
});

app.post("/auditors", requireAuth, requireGodAdmin, async (request, response) => {
  const { displayName, email } = request.body as { displayName?: string; email?: string };
  if (!displayName?.trim() || !email?.toLowerCase().endsWith("@compass-usa.com")) return response.status(400).json({ error: "Provide a name and Compass email address." });
  try {
    const { rows } = await pool.query(
      `INSERT INTO auditors (display_name, email, password_hash, can_audit) VALUES ($1, lower($2), crypt('AuditTest!2026', gen_salt('bf')), true)
       RETURNING id, display_name, email`, [displayName.trim(), email.trim()]
    );
    response.status(201).json({ id: rows[0].id, displayName: rows[0].display_name, email: rows[0].email, canAudit: true });
  } catch { response.status(409).json({ error: "That email already has an account." }); }
});

app.delete("/auditors/:auditorId", requireAuth, requireGodAdmin, async (request, response) => {
  const { rows } = await pool.query("UPDATE auditors SET active = false WHERE id = $1 AND is_god_admin = false AND active = true RETURNING id", [request.params.auditorId]);
  if (!rows[0]) return response.status(404).json({ error: "Active auditors can be removed, but God Admin accounts cannot be removed here." });
  response.status(204).end();
});

app.post("/audit-transfer-requests", requireAuth, async (request, response) => {
  const { locationId, requestedToId, note } = request.body as { locationId?: string; requestedToId?: string; note?: string };
  const auditor = authed(request).auditor;
  if (!auditor.canAudit) return response.status(403).json({ error: "Only active auditors can request a transfer." });
  if (!locationId || !requestedToId || requestedToId === auditor.id) return response.status(400).json({ error: "Choose a location and a different auditor." });
  const owner = await pool.query("SELECT id FROM locations WHERE id = $1 AND owner_auditor_id = $2 AND active = true", [locationId, auditor.id]);
  if (!owner.rows[0]) return response.status(403).json({ error: "You can only transfer responsibility for a location assigned to you." });
  const recipient = await pool.query("SELECT id FROM auditors WHERE id = $1 AND active = true AND can_audit = true", [requestedToId]);
  if (!recipient.rows[0]) return response.status(400).json({ error: "Choose an active auditor as the recipient." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO audit_responsibility_transfers (location_id, requested_by, requested_to, note) VALUES ($1, $2, $3, $4) RETURNING id, status",
      [locationId, auditor.id, requestedToId, note?.trim() ?? ""]
    );
    response.status(201).json(rows[0]);
  } catch { response.status(409).json({ error: "There is already a pending transfer request for this location." }); }
});

app.post("/audit-transfer-requests/:requestId/decision", requireAuth, async (request, response) => {
  const { accepted } = request.body as { accepted?: boolean };
  if (typeof accepted !== "boolean") return response.status(400).json({ error: "An accept or reject decision is required." });
  const auditor = authed(request).auditor;
  if (!auditor.canAudit) return response.status(403).json({ error: "Only active auditors can respond to a transfer." });
  const transfer = await withTransaction(async (client) => {
    const pending = await client.query(
      "SELECT id, location_id FROM audit_responsibility_transfers WHERE id = $1 AND requested_to = $2 AND status = 'pending' FOR UPDATE",
      [request.params.requestId, auditor.id]
    );
    if (!pending.rows[0]) return null;
    if (accepted) await client.query("UPDATE locations SET owner_auditor_id = $1 WHERE id = $2", [auditor.id, pending.rows[0].location_id]);
    await client.query("UPDATE audit_responsibility_transfers SET status = $1, responded_at = now() WHERE id = $2", [accepted ? "accepted" : "rejected", pending.rows[0].id]);
    return pending.rows[0];
  });
  if (!transfer) return response.status(404).json({ error: "That pending transfer request was not found." });
  response.status(204).end();
});

app.post("/auditor-absences", requireAuth, async (request, response) => {
  const { startDate, endDate, note } = request.body as { startDate?: string; endDate?: string; note?: string };
  const auditor = authed(request).auditor;
  if (!auditor.canAudit) return response.status(403).json({ error: "Only active auditors can log an absence." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "") || startDate! > endDate!) return response.status(400).json({ error: "Choose a valid leave start and end date." });
  const { rows } = await pool.query("INSERT INTO auditor_absences (auditor_id, start_date, end_date, note) VALUES ($1, $2, $3, $4) RETURNING id", [auditor.id, startDate, endDate, note?.trim() ?? ""]);
  response.status(201).json(rows[0]);
});

app.post("/audit-schedules", requireAuth, async (request, response) => {
  const { binderId, auditDate, assignedAuditorId } = request.body as { binderId?: string; auditDate?: string; assignedAuditorId?: string };
  const creator = authed(request).auditor;
  const canScheduleForOthers = creator.isGodAdmin || creator.isLocationManager;
  const targetAuditorId = canScheduleForOthers ? assignedAuditorId : creator.id;
  if (!binderId || !targetAuditorId || !/^\d{4}-\d{2}-\d{2}$/.test(auditDate ?? "")) return response.status(400).json({ error: "Binder and audit date are required." });
  const assignment = await pool.query(
    `SELECT b.id FROM binders b JOIN locations l ON l.id = b.location_id JOIN auditors a ON a.id = $2
      WHERE b.id = $1 AND l.active = true AND a.active = true AND a.can_audit = true AND (l.owner_auditor_id IS NULL OR l.owner_auditor_id <> a.id)`, [binderId, targetAuditorId]
  );
  if (!assignment.rows[0]) return response.status(400).json({ error: "Choose an active auditor who does not own this location." });
  try {
    const { rows } = await pool.query("INSERT INTO audit_schedules (binder_id, audit_date, assigned_auditor_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [binderId, auditDate, targetAuditorId, creator.id]);
    response.status(201).json(rows[0]);
  } catch { response.status(409).json({ error: "This binder already has an audit scheduled for that date." }); }
});

app.post("/audit-schedules/:scheduleId/coverage-requests", requireAuth, async (request, response) => {
  const { requestedToId, note } = request.body as { requestedToId?: string; note?: string };
  const auditor = authed(request).auditor;
  if (!auditor.canAudit || !requestedToId || requestedToId === auditor.id) return response.status(400).json({ error: "Choose another active auditor to cover this audit." });
  const eligible = await pool.query("SELECT id FROM auditors WHERE id = $1 AND active = true AND can_audit = true", [requestedToId]);
  if (!eligible.rows[0]) return response.status(400).json({ error: "Choose an active auditor to cover this audit." });
  const schedule = await pool.query("SELECT id FROM audit_schedules WHERE id = $1 AND assigned_auditor_id = $2 AND status IN ('scheduled', 'covered')", [request.params.scheduleId, auditor.id]);
  if (!schedule.rows[0]) return response.status(403).json({ error: "You can request coverage only for an audit assigned to you." });
  try {
    const { rows } = await pool.query("INSERT INTO audit_coverage_requests (schedule_id, requested_by, requested_to, note) VALUES ($1, $2, $3, $4) RETURNING id", [request.params.scheduleId, auditor.id, requestedToId, note?.trim() ?? ""]);
    response.status(201).json(rows[0]);
  } catch { response.status(409).json({ error: "There is already a pending coverage request for this audit." }); }
});

app.post("/audit-coverage-requests/:requestId/decision", requireAuth, async (request, response) => {
  const { accepted } = request.body as { accepted?: boolean };
  const auditor = authed(request).auditor;
  if (!auditor.canAudit || typeof accepted !== "boolean") return response.status(400).json({ error: "An accept or reject decision is required." });
  const result = await withTransaction(async (client) => {
    const pending = await client.query(
      `SELECT r.id, r.schedule_id, s.binder_id FROM audit_coverage_requests r JOIN audit_schedules s ON s.id = r.schedule_id
        WHERE r.id = $1 AND r.requested_to = $2 AND r.status = 'pending' FOR UPDATE`, [request.params.requestId, auditor.id]
    );
    if (!pending.rows[0]) return null;
    if (accepted) {
      const eligible = await client.query("SELECT 1 FROM binders b JOIN locations l ON l.id = b.location_id WHERE b.id = $1 AND (l.owner_auditor_id IS NULL OR l.owner_auditor_id <> $2)", [pending.rows[0].binder_id, auditor.id]);
      if (!eligible.rows[0]) throw new Error("owner cannot cover");
      await client.query("UPDATE audit_schedules SET assigned_auditor_id = $1, status = 'covered' WHERE id = $2", [auditor.id, pending.rows[0].schedule_id]);
    }
    await client.query("UPDATE audit_coverage_requests SET status = $1, responded_at = now() WHERE id = $2", [accepted ? "accepted" : "rejected", pending.rows[0].id]);
    return pending.rows[0];
  });
  if (!result) return response.status(404).json({ error: "That pending coverage request was not found." });
  response.status(204).end();
});

app.get("/dashboard", requireAuth, async (request, response) => {
  const auditor = authed(request).auditor;
  const ownedLocations = await pool.query("SELECT id, area_name, location_name FROM locations WHERE owner_auditor_id = $1 AND active = true ORDER BY area_name, location_name", [auditor.id]);
  const scope = auditor.isGodAdmin ? { where: "a.status = 'submitted'", values: [] as string[] } : { where: "l.owner_auditor_id = $1 AND a.status = 'submitted' AND a.auditor_id <> $1", values: [auditor.id] };
  const receivedAudits = await pool.query(
    `SELECT a.id, a.audit_date, l.area_name, l.location_name, b.binder_name, performed.display_name AS auditor_name,
            count(r.section_id) FILTER (WHERE r.result <> 'current') AS exception_count
       FROM audits a JOIN binders b ON b.id = a.binder_id JOIN locations l ON l.id = b.location_id
       JOIN auditors performed ON performed.id = a.auditor_id LEFT JOIN audit_responses r ON r.audit_id = a.id
      WHERE ${scope.where} GROUP BY a.id, l.area_name, l.location_name, b.binder_name, performed.display_name ORDER BY a.audit_date DESC, a.created_at DESC`, scope.values
  );
  const [incomingTransfers, sentTransfers, scheduledAudits, incomingCoverage, absences] = await Promise.all([
    pool.query(
      `SELECT t.id, t.note, t.created_at, l.area_name, l.location_name, sender.display_name AS sender_name
         FROM audit_responsibility_transfers t JOIN locations l ON l.id = t.location_id JOIN auditors sender ON sender.id = t.requested_by
        WHERE t.requested_to = $1 AND t.status = 'pending' ORDER BY t.created_at DESC`, [auditor.id]
    ),
    pool.query(
      `SELECT t.id, t.status, t.created_at, l.area_name, l.location_name, recipient.display_name AS recipient_name
         FROM audit_responsibility_transfers t JOIN locations l ON l.id = t.location_id JOIN auditors recipient ON recipient.id = t.requested_to
        WHERE t.requested_by = $1 ORDER BY t.created_at DESC`, [auditor.id]
    ),
    pool.query(
      `SELECT s.id, s.audit_date, s.status, l.area_name, l.location_name, b.binder_name
         FROM audit_schedules s JOIN binders b ON b.id = s.binder_id JOIN locations l ON l.id = b.location_id
        WHERE s.assigned_auditor_id = $1 AND s.audit_date >= current_date AND s.status IN ('scheduled', 'covered') ORDER BY s.audit_date, l.location_name`, [auditor.id]
    ),
    pool.query(
      `SELECT r.id, r.note, s.audit_date, l.area_name, l.location_name, b.binder_name, sender.display_name AS sender_name
         FROM audit_coverage_requests r JOIN audit_schedules s ON s.id = r.schedule_id JOIN binders b ON b.id = s.binder_id
         JOIN locations l ON l.id = b.location_id JOIN auditors sender ON sender.id = r.requested_by
        WHERE r.requested_to = $1 AND r.status = 'pending' ORDER BY s.audit_date, r.created_at`, [auditor.id]
    ),
    pool.query(
      `SELECT a.display_name, x.start_date, x.end_date, x.note FROM auditor_absences x JOIN auditors a ON a.id = x.auditor_id
        WHERE x.auditor_id <> $1 AND x.end_date >= current_date ORDER BY x.start_date, a.display_name`, [auditor.id]
    )
  ]);
  response.json({
    isGodAdmin: auditor.isGodAdmin,
    ownedLocations: ownedLocations.rows.map((row) => ({ id: row.id, areaName: row.area_name, locationName: row.location_name })),
    receivedAudits: receivedAudits.rows.map((row) => ({ id: row.id, auditDate: row.audit_date, areaName: row.area_name, locationName: row.location_name, binderName: row.binder_name, auditorName: row.auditor_name, exceptionCount: Number(row.exception_count) })),
    incomingTransfers: incomingTransfers.rows.map((row) => ({ id: row.id, note: row.note, createdAt: row.created_at, areaName: row.area_name, locationName: row.location_name, senderName: row.sender_name })),
    sentTransfers: sentTransfers.rows.map((row) => ({ id: row.id, status: row.status, createdAt: row.created_at, areaName: row.area_name, locationName: row.location_name, recipientName: row.recipient_name })),
    scheduledAudits: scheduledAudits.rows.map((row) => ({ id: row.id, auditDate: row.audit_date, status: row.status, areaName: row.area_name, locationName: row.location_name, binderName: row.binder_name })),
    incomingCoverage: incomingCoverage.rows.map((row) => ({ id: row.id, note: row.note, auditDate: row.audit_date, areaName: row.area_name, locationName: row.location_name, binderName: row.binder_name, senderName: row.sender_name })),
    absences: absences.rows.map((row) => ({ displayName: row.display_name, startDate: row.start_date, endDate: row.end_date, note: row.note }))
  });
});

app.get("/audits/:auditId", requireAuth, async (request, response) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.audit_date, l.owner_auditor_id, l.area_name, l.location_name, b.binder_name,
            performed.id AS performed_by_id, performed.display_name AS auditor_name
       FROM audits a JOIN binders b ON b.id = a.binder_id JOIN locations l ON l.id = b.location_id
       JOIN auditors performed ON performed.id = a.auditor_id
      WHERE a.id = $1 AND a.status = 'submitted'`, [request.params.auditId]
  );
  const audit = rows[0];
  if (!audit) return response.status(404).json({ error: "Audit not found." });
  const viewer = authed(request).auditor;
  if (!viewer.isGodAdmin && audit.owner_auditor_id !== viewer.id && audit.performed_by_id !== viewer.id) return response.status(403).json({ error: "You are not allowed to review this audit." });
  const responses = await pool.query("SELECT section_id, result, comment FROM audit_responses WHERE audit_id = $1 ORDER BY CASE section_id WHEN 'safety' THEN 1 WHEN 'opening' THEN 2 WHEN 'mid' THEN 3 WHEN 'closing' THEN 4 WHEN 'cooler' THEN 5 WHEN 'two-hour' THEN 6 WHEN 'protein' THEN 7 WHEN 'test' THEN 8 END", [audit.id]);
  response.json({ id: audit.id, auditDate: audit.audit_date, areaName: audit.area_name, locationName: audit.location_name, binderName: audit.binder_name, auditorName: audit.auditor_name, responses: responses.rows.map((row) => ({ sectionId: row.section_id, result: row.result, comment: row.comment })) });
});

app.post("/audits", requireAuth, async (request, response) => {
  if (!authed(request).auditor.canAudit) return response.status(403).json({ error: "God Admin accounts can view all audits but cannot submit an audit." });
  const { binderId, responses } = request.body as { binderId?: string; responses?: Array<{ sectionId: string; result: AuditResult; comment: string }> };
  if (!binderId || !responses || responses.length !== sectionIds.length) return response.status(400).json({ error: "Every audit section is required." });
  const bySection = new Map(responses.map((item) => [item.sectionId, item]));
  if (sectionIds.some((section) => !bySection.has(section)) || responses.some((item) => !["current", "past", "missing"].includes(item.result) || (item.result !== "current" && !item.comment.trim()))) return response.status(400).json({ error: "Each section needs a valid result; past or missing evidence needs a comment." });
  const scheduled = await pool.query("SELECT assigned_auditor_id FROM audit_schedules WHERE binder_id = $1 AND audit_date = current_date AND status IN ('scheduled', 'covered')", [binderId]);
  if (scheduled.rows[0] && scheduled.rows[0].assigned_auditor_id !== authed(request).auditor.id) return response.status(403).json({ error: "This audit is scheduled for another auditor today." });
  try {
    const audit = await withTransaction(async (client) => {
      const created = await client.query("INSERT INTO audits (binder_id, auditor_id, audit_date, status, submitted_at) VALUES ($1, $2, current_date, 'submitted', now()) RETURNING id, audit_date", [binderId, authed(request).auditor.id]);
      for (const item of responses) await client.query("INSERT INTO audit_responses (audit_id, section_id, result, comment) VALUES ($1, $2, $3, $4)", [created.rows[0].id, item.sectionId, item.result, item.comment.trim()]);
      return created.rows[0];
    });
    response.status(201).json({ id: audit.id, auditDate: audit.audit_date });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    response.status(409).json({ error: message.includes("owner cannot audit") ? "You cannot audit a location you own." : message.includes("audits_binder_id_audit_date_key") ? "An audit for this binder was already submitted today." : "Unable to submit this audit." });
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => { console.error(error); response.status(500).json({ error: "Unexpected server error." }); });
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Handshake API listening on port ${port}`));
