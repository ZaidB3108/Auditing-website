import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { Pool, type PoolClient } from "pg";

type AuditResult = "current" | "past" | "missing";
type AuthenticatedRequest = Request & { auditor: { id: string; displayName: string; email: string; isCoreApprover: boolean }; token: string };

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sectionIds = ["safety", "opening", "mid", "closing", "cooler", "two-hour", "protein", "test"];
app.use(cors());
app.use(express.json());

const authed = (request: Request) => request as AuthenticatedRequest;

async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return response.status(401).json({ error: "Sign in is required." });
  const { rows } = await pool.query(
    `SELECT a.id, a.display_name, a.email, a.is_core_approver
       FROM auth_sessions s JOIN auditors a ON a.id = s.auditor_id
      WHERE s.token = $1 AND s.expires_at > now() AND a.active = true`,
    [token]
  );
  if (!rows[0]) return response.status(401).json({ error: "Your session has expired. Please sign in again." });
  authed(request).token = token;
  authed(request).auditor = { id: rows[0].id, displayName: rows[0].display_name, email: rows[0].email, isCoreApprover: rows[0].is_core_approver };
  next();
}

function requireCoreApprover(request: Request, response: Response, next: NextFunction) {
  if (!authed(request).auditor.isCoreApprover) return response.status(403).json({ error: "Only the original four auditors can manage this setting." });
  next();
}

async function withTransaction<T>(action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

app.get("/health", async (_request, response) => {
  await pool.query("SELECT 1");
  response.json({ status: "ok" });
});

app.get("/auth/test-accounts", async (_request, response) => {
  const { rows } = await pool.query("SELECT email, display_name FROM auditors WHERE active = true ORDER BY display_name");
  response.json(rows.map((row) => ({ email: row.email, displayName: row.display_name })));
});

app.post("/auth/login", async (request, response) => {
  const { email, password } = request.body as { email?: string; password?: string };
  if (!email?.endsWith("@compass-usa.com") || !password) return response.status(400).json({ error: "Use a Compass email address and password." });
  const { rows } = await pool.query(
    `SELECT id, display_name, email, is_core_approver FROM auditors
      WHERE lower(email) = lower($1) AND active = true AND password_hash = crypt($2, password_hash)`,
    [email.trim(), password]
  );
  if (!rows[0]) return response.status(401).json({ error: "Email or password is not recognized." });
  const auditor = rows[0];
  const session = await pool.query("INSERT INTO auth_sessions (auditor_id) VALUES ($1) RETURNING token", [auditor.id]);
  response.json({ token: session.rows[0].token, auditor: { id: auditor.id, displayName: auditor.display_name, email: auditor.email, isCoreApprover: auditor.is_core_approver } });
});

app.post("/auth/logout", requireAuth, async (request, response) => {
  await pool.query("DELETE FROM auth_sessions WHERE token = $1", [authed(request).token]);
  response.status(204).end();
});

app.get("/locations", requireAuth, async (_request, response) => {
  const { rows } = await pool.query(
    `SELECT l.id, l.area_name, l.location_name, l.owner_auditor_id, owner.display_name AS owner_name,
            coalesce(json_agg(json_build_object('id', b.id, 'binderName', b.binder_name) ORDER BY b.binder_name)
              FILTER (WHERE b.id IS NOT NULL), '[]') AS binders
       FROM locations l JOIN auditors owner ON owner.id = l.owner_auditor_id
       LEFT JOIN binders b ON b.location_id = l.id
      WHERE l.active = true GROUP BY l.id, owner.display_name ORDER BY l.area_name, l.location_name`
  );
  response.json(rows.map((row) => ({ id: row.id, areaName: row.area_name, locationName: row.location_name, ownerAuditorId: row.owner_auditor_id, ownerName: row.owner_name, binders: row.binders })));
});

app.post("/locations", requireAuth, requireCoreApprover, async (request, response) => {
  const { areaName, locationName, binderName, ownerAuditorId } = request.body as { areaName?: string; locationName?: string; binderName?: string; ownerAuditorId?: string };
  if (!areaName?.trim() || !locationName?.trim() || !binderName?.trim() || !ownerAuditorId) return response.status(400).json({ error: "Area, location, binder, and owner are required." });
  const location = await withTransaction(async (client) => {
    const created = await client.query("INSERT INTO locations (area_name, location_name, owner_auditor_id) VALUES ($1, $2, $3) RETURNING id", [areaName.trim(), locationName.trim(), ownerAuditorId]);
    await client.query("INSERT INTO binders (location_id, binder_name) VALUES ($1, $2)", [created.rows[0].id, binderName.trim()]);
    return created.rows[0];
  });
  response.status(201).json(location);
});

app.get("/auditors", requireAuth, async (_request, response) => {
  const { rows } = await pool.query("SELECT id, display_name, email, is_core_approver FROM auditors WHERE active = true ORDER BY display_name");
  response.json(rows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, isCoreApprover: row.is_core_approver })));
});

app.get("/dashboard", requireAuth, async (request, response) => {
  const auditor = authed(request).auditor;
  const [ownedLocations, receivedAudits, proposals] = await Promise.all([
    pool.query("SELECT id, area_name, location_name FROM locations WHERE owner_auditor_id = $1 AND active = true ORDER BY area_name, location_name", [auditor.id]),
    pool.query(
      `SELECT a.id, a.audit_date, l.area_name, l.location_name, b.binder_name, performed.display_name AS auditor_name,
              count(r.section_id) FILTER (WHERE r.result <> 'current') AS exception_count
         FROM audits a JOIN binders b ON b.id = a.binder_id JOIN locations l ON l.id = b.location_id
         JOIN auditors performed ON performed.id = a.auditor_id LEFT JOIN audit_responses r ON r.audit_id = a.id
        WHERE l.owner_auditor_id = $1 AND a.status = 'submitted' AND a.auditor_id <> $1
        GROUP BY a.id, l.area_name, l.location_name, b.binder_name, performed.display_name
        ORDER BY a.audit_date DESC, a.created_at DESC`,
      [auditor.id]
    ),
    auditor.isCoreApprover ? pool.query("SELECT p.id, p.display_name, p.email, p.status, count(v.auditor_id) FILTER (WHERE v.approved) AS approvals FROM auditor_proposals p LEFT JOIN auditor_proposal_votes v ON v.proposal_id = p.id GROUP BY p.id ORDER BY p.created_at DESC") : Promise.resolve({ rows: [] })
  ]);
  response.json({
    ownedLocations: ownedLocations.rows.map((row) => ({ id: row.id, areaName: row.area_name, locationName: row.location_name })),
    receivedAudits: receivedAudits.rows.map((row) => ({ id: row.id, auditDate: row.audit_date, areaName: row.area_name, locationName: row.location_name, binderName: row.binder_name, auditorName: row.auditor_name, exceptionCount: Number(row.exception_count) })),
    proposals: proposals.rows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, status: row.status, approvals: Number(row.approvals) }))
  });
});

app.post("/audits", requireAuth, async (request, response) => {
  const { binderId, responses } = request.body as { binderId?: string; responses?: Array<{ sectionId: string; result: AuditResult; comment: string }> };
  if (!binderId || !responses || responses.length !== sectionIds.length) return response.status(400).json({ error: "Every audit section is required." });
  const resultBySection = new Map(responses.map((item) => [item.sectionId, item]));
  if (sectionIds.some((section) => !resultBySection.has(section)) || responses.some((item) => !["current", "past", "missing"].includes(item.result) || (item.result !== "current" && !item.comment.trim()))) return response.status(400).json({ error: "Each section needs a valid result; past or missing evidence needs a comment." });
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

app.post("/auditor-proposals", requireAuth, requireCoreApprover, async (request, response) => {
  const { displayName, email } = request.body as { displayName?: string; email?: string };
  if (!displayName?.trim() || !email?.toLowerCase().endsWith("@compass-usa.com")) return response.status(400).json({ error: "Provide a name and Compass email address." });
  try {
    const { rows } = await pool.query("INSERT INTO auditor_proposals (display_name, email, proposed_by) VALUES ($1, lower($2), $3) RETURNING id, status", [displayName.trim(), email.trim(), authed(request).auditor.id]);
    response.status(201).json(rows[0]);
  } catch {
    response.status(409).json({ error: "That email already has an account or open proposal." });
  }
});

app.post("/auditor-proposals/:proposalId/votes", requireAuth, requireCoreApprover, async (request, response) => {
  const { approved } = request.body as { approved?: boolean };
  if (typeof approved !== "boolean") return response.status(400).json({ error: "An approval decision is required." });
  await pool.query("INSERT INTO auditor_proposal_votes (proposal_id, auditor_id, approved) VALUES ($1, $2, $3) ON CONFLICT (proposal_id, auditor_id) DO UPDATE SET approved = excluded.approved, voted_at = now()", [request.params.proposalId, authed(request).auditor.id, approved]);
  response.status(204).end();
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Unexpected server error." });
});

app.listen(Number(process.env.PORT ?? 3001), () => console.log("Handshake API listening on port 3001"));
