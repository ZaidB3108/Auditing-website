import { useEffect, useState, type FormEvent } from "react";
import "./audit-date.css";
import "./polish.css";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
// Future feature: keep audit scheduling and coverage code, but hide its UI.
const AUDIT_SCHEDULING_ENABLED = false;
const formatAuditDate = (value: string) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (!dateOnly) return "Date unavailable";
  const date = new Date(`${dateOnly}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
  }).format(date);
};
type Result = "current" | "past" | "missing" | "not_applicable";
type Auditor = { id: string; displayName: string; email: string; isGodAdmin: boolean; isLocationManager: boolean; canAudit: boolean; mustChangePassword: boolean };
const canAssignLocations = (auditor: Auditor) => ["zaid.basri@compass-usa.com", "charles.weaver@compass-usa.com"].includes(auditor.email.toLowerCase());
type Binder = { id: string; binderName: string; canAudit: boolean };
type Location = { id: string; areaName: string; locationName: string; ownerAuditorId: string | null; ownerName: string; binders: Binder[] };
type Section = { id: string; title: string; detail?: string };
type AuditResponse = { results: Result[]; comment: string };
type AuditSummary = { id: string; auditDate: string; areaName: string; locationName: string; binderName: string; auditorName: string; exceptionCount: number };
type AuditDetail = AuditSummary & { overallComment: string | null; reviewedAt: string | null; responses: Array<{ sectionId: string; results: Result[]; comment: string }> };
type Transfer = { id: string; note?: string; status?: string; createdAt: string; areaName: string; locationName: string; senderName?: string; recipientName?: string };
type TransferRequest = Transfer & { recipientId: string };
type ScheduledAudit = { id: string; auditDate: string; status: string; areaName: string; locationName: string; binderName: string };
type CoverageRequest = { id: string; note: string; auditDate: string; areaName: string; locationName: string; binderName: string; senderName: string };
type AbsenceNotice = { displayName: string; startDate: string; endDate: string; note: string };
type Dashboard = { isGodAdmin: boolean; ownedLocations: Array<{ id: string; areaName: string; locationName: string }>; receivedAudits: AuditSummary[]; incomingTransfers: Transfer[]; transferRequests: TransferRequest[]; sentTransfers: Transfer[]; scheduledAudits: ScheduledAudit[]; incomingCoverage: CoverageRequest[]; absences: AbsenceNotice[] };

const sections: Section[] = [
  { id: "safety", title: "Safety Topic and Sign-off" }, { id: "opening", title: "Opening Checklist" }, { id: "mid", title: "Mid Checklist" }, { id: "closing", title: "Closing Checklist" },
  { id: "cooler", title: "Cooler Temp Logs" }, { id: "two-hour", title: "2 hour food temp logs" }, { id: "protein", title: "Protein Temp Logs Maintained with MGR Sign-off" },
  { id: "test", title: "Checklist Test Item(s)", detail: "Use the section comment to record the test item." }
];
const blankResponses = () => Object.fromEntries(sections.map((section) => [section.id, { results: ["current", "past"] as Result[], comment: "" }]));

async function request<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Request failed."); }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("handshake-token") ?? "");
  const [auditor, setAuditor] = useState<Auditor | null>(() => { const saved = localStorage.getItem("handshake-auditor"); return saved ? JSON.parse(saved) as Auditor : null; });
  const [error] = useState("");
  const logout = async () => { try { await request("/auth/logout", token, { method: "POST" }); } catch { /* session may already be gone */ } localStorage.removeItem("handshake-token"); localStorage.removeItem("handshake-auditor"); setToken(""); setAuditor(null); };
  const signIn = (sessionToken: string, signedIn: Auditor) => { localStorage.setItem("handshake-token", sessionToken); localStorage.setItem("handshake-auditor", JSON.stringify(signedIn)); setToken(sessionToken); setAuditor(signedIn); };
  if (!token || !auditor) return <Login error={error} onLogin={signIn} />;
  if (auditor.mustChangePassword) return <ChangePassword token={token} auditor={auditor} onChanged={signIn} onLogout={logout} />;
  return <Application token={token} auditor={auditor} onLogout={logout} />;
}

function Login({ error, onLogin }: { error: string; onLogin: (token: string, auditor: Auditor) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setMessage(""); try { const data = await request<{ token: string; auditor: Auditor }>("/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) }); onLogin(data.token, data.auditor); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to sign in."); } finally { setBusy(false); } };
  return <main className="login-page"><section className="login-card"><div className="brand large">HANDSHAKE <span>WEEKLY AUDITS</span></div><h1>Sign in</h1><p>Use your approved Compass audit account.</p>{error && <p className="error">{error}</p>}<form onSubmit={submit}><label>Compass email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@compass-usa.com" autoComplete="username" required /><small>Sign in with your Compass email ID.</small></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form>{message && <p className="error">{message}</p>}</section></main>;
}

function ChangePassword({ token, auditor, onChanged, onLogout }: { token: string; auditor: Auditor; onChanged: (token: string, auditor: Auditor) => void; onLogout: () => void }) {
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (newPassword !== confirmPassword) return setMessage("The new passwords do not match."); setBusy(true); setMessage(""); try { const data = await request<{ auditor: Auditor }>("/auth/change-password", token, { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); onChanged(token, data.auditor); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to change password."); } finally { setBusy(false); } };
  return <main className="login-page"><section className="login-card"><div className="brand large">HANDSHAKE <span>WEEKLY AUDITS</span></div><h1>Create your password</h1><p>Welcome, {auditor.displayName}. Replace the temporary staging password before continuing.</p><form onSubmit={submit}><label>Temporary password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /><small>At least 12 characters, with upper- and lower-case letters, a number, and a symbol.</small></label><label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label><button disabled={busy}>{busy ? "Saving…" : "Save password"}</button></form><button className="text-button" onClick={onLogout}>Sign out</button>{message && <p className="error">{message}</p>}</section></main>;
}

function Application({ token, auditor, onLogout }: { token: string; auditor: Auditor; onLogout: () => void }) {
  const [view, setView] = useState<"locations" | "profile" | "admin" | "assignments" | "schedule">("locations"); const [locations, setLocations] = useState<Location[]>([]); const [auditors, setAuditors] = useState<Auditor[]>([]); const [dashboard, setDashboard] = useState<Dashboard | null>(null); const [selected, setSelected] = useState<{ location: Location; binder: Binder } | null>(null); const [message, setMessage] = useState("");
  const load = async () => { try { const [locationData, auditorData, dashboardData] = await Promise.all([request<Location[]>("/locations", token), request<Auditor[]>("/auditors", token), request<Dashboard>("/dashboard", token)]); setLocations(locationData); setAuditors(auditorData); setDashboard(dashboardData); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to load data."); } };
  useEffect(() => { void load(); }, []);
  const tabs = {
    profile: auditor.isGodAdmin ? "All audits" : "My audits & transfers",
    assignments: "Assignments",
    admin: "Admin",
    locations: "Locations",
    schedule: canAssignLocations(auditor) ? "Leave and transfer requests" : "Schedule a leave"
  };
  const tabOrder: Array<keyof typeof tabs> = canAssignLocations(auditor)
    ? ["profile", "assignments", "admin", "locations", "schedule"]
    : ["locations", "profile", "schedule", "assignments", "admin"];
  const visibleTabs = tabOrder.filter((tab) =>
    tab === "assignments" ? canAssignLocations(auditor) : tab === "admin" ? auditor.isGodAdmin : true
  );
  if (selected) return <AuditForm token={token} auditor={auditor} selection={selected} onBack={() => setSelected(null)} onSubmitted={() => { setSelected(null); void load(); }} />;
  return <main className="app-shell"><header><div className="brand">HANDSHAKE <span>WEEKLY AUDITS</span></div><div className="account">{auditor.displayName}<button className="text-button" onClick={onLogout}>Sign out</button></div></header><div className="page"><nav>{visibleTabs.map((tab) => <button key={tab} className={view === tab ? "active" : ""} onClick={() => setView(tab)}>{tabs[tab]}</button>)}</nav>{message && <p className="error">{message}</p>}{view === "locations" && <LocationView locations={locations} auditors={auditors} auditor={auditor} onChoose={(location, binder) => setSelected({ location, binder })} />}{view === "profile" && <ProfileView dashboard={dashboard} token={token} auditor={auditor} auditors={auditors} onUpdate={load} />}{view === "schedule" && <ScheduleView token={token} auditor={auditor} auditors={auditors} locations={locations} dashboard={dashboard} onUpdate={load} />}{view === "assignments" && canAssignLocations(auditor) && <LocationAssignmentsView token={token} locations={locations} auditors={auditors} onUpdate={load} />}{view === "admin" && auditor.isGodAdmin && <AdminView token={token} auditors={auditors} canAssignOwner={canAssignLocations(auditor)} canResetPasswords={auditor.email.toLowerCase() === "zaid.basri@compass-usa.com"} onUpdate={load} />}</div></main>;
}

function LocationView({ locations, auditor, onChoose }: { locations: Location[]; auditors: Auditor[]; auditor: Auditor; onChoose: (location: Location, binder: Binder) => void }) {
  const assigned = auditor.canAudit ? locations.filter((location) => location.binders.some((binder) => binder.canAudit)) : locations;
  return <section><div className="heading"><div><h1>{auditor.canAudit ? "My assigned locations" : "Locations"}</h1><p>{auditor.canAudit ? "These are the locations assigned to you to audit." : "Chartwells Admin can view all locations and submitted audits."}</p></div></div><div className="location-grid">{assigned.map((location) => <article className="location-card" key={location.id}><div><h2>{location.locationName}</h2><p>Assigned auditor: <strong>{location.ownerName}</strong></p></div>{auditor.canAudit && <div>{location.binders.filter((binder) => binder.canAudit).map((binder) => <button key={binder.id} onClick={() => onChoose(location, binder)}>Audit {binder.binderName}</button>)}</div>}</article>)}</div>{!assigned.length && <p className="empty">No locations are currently assigned to you. Contact Chartwells Admin or Chuck for an assignment.</p>}</section>;
}
function LocationAssignmentsView({ token, locations, auditors, onUpdate }: { token: string; locations: Location[]; auditors: Auditor[]; onUpdate: () => Promise<void> }) { return <section><div className="heading"><div><h1>Location assignments</h1><p>Assign or reassign any location to an active auditor.</p></div></div><div className="location-grid">{locations.map((location) => <LocationAssignmentRow key={location.id} token={token} location={location} auditors={auditors} onUpdate={onUpdate} />)}</div></section>; }

function LocationAssignmentRow({ token, location, auditors, onUpdate }: { token: string; location: Location; auditors: Auditor[]; onUpdate: () => Promise<void> }) { const [ownerAuditorId, setOwnerAuditorId] = useState(location.ownerAuditorId ?? ""); const [message, setMessage] = useState(""); const save = async () => { try { await request(`/locations/${location.id}/owner`, token, { method: "PATCH", body: JSON.stringify({ ownerAuditorId: ownerAuditorId || null }) }); setMessage("Assignment saved."); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save assignment."); } }; return <article className="location-card"><div><h2>{location.locationName}</h2><p>Assigned auditor: <strong>{location.ownerName}</strong></p></div><div><label>Assign to<select value={ownerAuditorId} onChange={(event) => setOwnerAuditorId(event.target.value)}><option value="">Unassigned</option>{auditors.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label><button onClick={() => void save()}>Save assignment</button>{message && <small>{message}</small>}</div></article>; }

function ScheduleView({ token, auditor, auditors, locations, dashboard, onUpdate }: { token: string; auditor: Auditor; auditors: Auditor[]; locations: Location[]; dashboard: Dashboard | null; onUpdate: () => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10); const canScheduleForOthers = canAssignLocations(auditor);
  const [absence, setAbsence] = useState({ startDate: today, endDate: today, note: "" }); const [schedule, setSchedule] = useState({ binderId: "", auditDate: today, assignedAuditorId: "" }); const [message, setMessage] = useState("");
  if (!dashboard) return <p>Loading schedule…</p>;
  const logAbsence = async (event: FormEvent) => { event.preventDefault(); try { await request("/auditor-absences", token, { method: "POST", body: JSON.stringify(absence) }); setMessage("Leave logged. Other auditors can now see the notice on their dashboard."); setAbsence({ startDate: today, endDate: today, note: "" }); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to log leave."); } };
  const createSchedule = async (event: FormEvent) => { event.preventDefault(); try { await request("/audit-schedules", token, { method: "POST", body: JSON.stringify({ ...schedule, assignedAuditorId: canScheduleForOthers ? schedule.assignedAuditorId : auditor.id }) }); setMessage(canScheduleForOthers ? "Audit scheduled." : "Audit added to your schedule. You can now request coverage if needed."); setSchedule({ binderId: "", auditDate: today, assignedAuditorId: "" }); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to schedule audit."); } };
  const decideCoverage = async (requestId: string, accepted: boolean) => { try { await request(`/audit-coverage-requests/${requestId}/decision`, token, { method: "POST", body: JSON.stringify({ accepted }) }); setMessage(accepted ? "Coverage accepted. The audit is now assigned to you." : "Coverage request rejected."); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to respond to coverage request."); } };
  return <section><div className="heading"><div><h1>{canAssignLocations(auditor) ? "Leave and transfer requests" : "Schedule a leave"}</h1><p>{canAssignLocations(auditor) ? "View team leave notices and location transfer requests." : "Notify the team of your leave or absence and view team leave notices."}</p></div></div>{message && <p className="success-message">{message}</p>}<div className="management-grid">{auditor.canAudit && <form className="panel" onSubmit={logAbsence}><h2>Notify a leave or absence</h2><label>Start date<input type="date" value={absence.startDate} min={today} onChange={(event) => setAbsence({ ...absence, startDate: event.target.value })} required /></label><label>End date<input type="date" value={absence.endDate} min={absence.startDate} onChange={(event) => setAbsence({ ...absence, endDate: event.target.value })} required /></label><label>Note (optional)<textarea value={absence.note} onChange={(event) => setAbsence({ ...absence, note: event.target.value })} placeholder="Optional leave details" /></label><button>Notify auditors</button></form>}{AUDIT_SCHEDULING_ENABLED && (auditor.canAudit || canScheduleForOthers) && <form className="panel" onSubmit={createSchedule}><h2>{canScheduleForOthers ? "Schedule an audit" : "Add an audit to my schedule"}</h2><label>Location and binder<select value={schedule.binderId} onChange={(event) => setSchedule({ ...schedule, binderId: event.target.value })} required><option value="">Choose a location</option>{locations.filter((location) => location.ownerAuditorId === (canScheduleForOthers ? schedule.assignedAuditorId : auditor.id)).flatMap((location) => location.binders.map((binder) => <option key={binder.id} value={binder.id}>{location.locationName} · {binder.binderName}</option>))}</select></label><label>Audit date<input type="date" value={schedule.auditDate} min={today} onChange={(event) => setSchedule({ ...schedule, auditDate: event.target.value })} required /></label>{canScheduleForOthers && <label>Assign auditor<select value={schedule.assignedAuditorId} onChange={(event) => setSchedule({ ...schedule, binderId: "", assignedAuditorId: event.target.value })} required><option value="">Choose auditor</option>{auditors.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>}<button>{canScheduleForOthers ? "Schedule audit" : "Add to my schedule"}</button></form>}</div>{AUDIT_SCHEDULING_ENABLED && auditor.canAudit && <ScheduledAuditsPanel token={token} auditor={auditor} auditors={auditors} scheduledAudits={dashboard.scheduledAudits} onUpdate={onUpdate} />}{<div className="profile-grid">{AUDIT_SCHEDULING_ENABLED && auditor.canAudit && <article className="panel"><h2>Coverage requests for me</h2>{dashboard.incomingCoverage.length ? <div className="audit-list">{dashboard.incomingCoverage.map((item) => <div key={item.id}><strong>{formatAuditDate(item.auditDate)} · {item.locationName} · {item.binderName}</strong><span>Requested by {item.senderName}{item.note ? ` · ${item.note}` : ""}</span><div><button onClick={() => void decideCoverage(item.id, true)}>Accept coverage</button><button className="secondary" onClick={() => void decideCoverage(item.id, false)}>Reject</button></div></div>)}</div> : <p className="empty">No pending coverage requests.</p>}</article>}<article className="panel"><h2>Team leave notices</h2>{dashboard.absences.length ? <div className="audit-list">{dashboard.absences.map((item, index) => <div key={`${item.displayName}-${item.startDate}-${index}`}><strong>{item.displayName}</strong><span>{item.startDate} to {item.endDate}{item.note ? ` · ${item.note}` : ""}</span></div>)}</div> : <p className="empty">No upcoming leave notices.</p>}</article></div>}{canAssignLocations(auditor) && <TransferRequestsPanel token={token} auditor={auditor} transfers={dashboard.transferRequests ?? []} onUpdate={onUpdate} />}</section>;
}

function TransferRequestsPanel({ token, auditor, transfers, onUpdate }: { token: string; auditor: Auditor; transfers: TransferRequest[]; onUpdate: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (id: string, accepted: boolean) => {
    setBusy(true); setMessage("");
    try {
      await request(`/audit-transfer-requests/${id}/decision`, token, { method: "POST", body: JSON.stringify({ accepted }) });
      setMessage(accepted ? "Transfer accepted. You are now assigned to audit this location." : "Transfer request rejected.");
      await onUpdate();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to respond to this transfer."); }
    finally { setBusy(false); }
  };
  return <article className="panel proposals"><h2>Location transfer requests</h2>
    <p>All requests are shown for visibility. Only the receiving auditor can accept or reject a request.</p>
    {message && <p role="status">{message}</p>}
    {transfers.length ? <div className="audit-list">{transfers.map((item) => <div key={item.id}>
      <strong>{item.locationName}</strong>
      <span>From {item.senderName} to {item.recipientName}</span>
      <span>Status: {item.status === "pending" ? "Pending" : item.status === "accepted" ? "Accepted" : "Rejected"} · Requested {new Date(item.createdAt).toLocaleDateString()}</span>
      {item.note && <p>{item.note}</p>}
      {auditor.canAudit && item.status === "pending" && item.recipientId === auditor.id && <div>
        <button disabled={busy} onClick={() => void decide(item.id, true)}>Accept</button>
        <button disabled={busy} className="secondary" onClick={() => void decide(item.id, false)}>Reject</button>
      </div>}
    </div>)}</div> : <p className="empty">No location transfer requests yet.</p>}
  </article>;
}

function ScheduledAuditsPanel({ token, auditor, auditors, scheduledAudits, onUpdate }: { token: string; auditor: Auditor; auditors: Auditor[]; scheduledAudits: ScheduledAudit[]; onUpdate: () => Promise<void> }) {
  const [coverage, setCoverage] = useState({ scheduleId: "", requestedToId: "", note: "" }); const [message, setMessage] = useState("");
  const requestCoverage = async (event: FormEvent) => { event.preventDefault(); try { await request(`/audit-schedules/${coverage.scheduleId}/coverage-requests`, token, { method: "POST", body: JSON.stringify({ requestedToId: coverage.requestedToId, note: coverage.note }) }); setCoverage({ scheduleId: "", requestedToId: "", note: "" }); setMessage("Coverage request sent."); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to request coverage."); } };
  return <div className="profile-grid"><article className="panel"><h2>My upcoming audits</h2>{scheduledAudits.length ? <div className="audit-list">{scheduledAudits.map((item) => <div key={item.id}><strong>{formatAuditDate(item.auditDate)} · {item.locationName} · {item.binderName}</strong><span>{item.status === "covered" ? "Covered assignment" : "Scheduled"}</span></div>)}</div> : <p className="empty">Add an eligible audit to your schedule above, then request coverage for it.</p>}</article><form className="panel" onSubmit={requestCoverage}><h2>Request audit coverage</h2><p>Transfer one scheduled audit to another auditor while you are away.</p><label>Scheduled audit<select value={coverage.scheduleId} onChange={(event) => setCoverage({ ...coverage, scheduleId: event.target.value })} required><option value="">Choose scheduled audit</option>{scheduledAudits.map((item) => <option key={item.id} value={item.id}>{formatAuditDate(item.auditDate)} · {item.locationName}</option>)}</select></label><label>Ask auditor<select value={coverage.requestedToId} onChange={(event) => setCoverage({ ...coverage, requestedToId: event.target.value })} required><option value="">Choose auditor</option>{auditors.filter((item) => item.id !== auditor.id).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><label>Note (optional)<textarea value={coverage.note} onChange={(event) => setCoverage({ ...coverage, note: event.target.value })} placeholder="Reason or handoff detail" /></label><button disabled={!scheduledAudits.length}>Request coverage</button>{message && <small>{message}</small>}</form></div>;
}

function CoverageDashboardNotice({ dashboard }: { dashboard: Dashboard }) { if (!dashboard.absences.length && !(AUDIT_SCHEDULING_ENABLED && dashboard.incomingCoverage.length)) return null; return <div className="profile-grid">{AUDIT_SCHEDULING_ENABLED && <article className="panel"><h2>Coverage attention</h2>{dashboard.incomingCoverage.length ? <p>You have {dashboard.incomingCoverage.length} coverage request{dashboard.incomingCoverage.length === 1 ? "" : "s"} awaiting a response in <strong>Schedule a leave</strong>.</p> : <p className="empty">No coverage requests awaiting your response.</p>}</article>}<article className="panel"><h2>Team leave notices</h2>{dashboard.absences.length ? <div className="audit-list">{dashboard.absences.slice(0, 3).map((item, index) => <div key={`${item.displayName}-${item.startDate}-${index}`}><strong>{item.displayName}</strong><span>{item.startDate} to {item.endDate}</span></div>)}</div> : <p className="empty">No upcoming leave notices.</p>}</article></div>; }

function ProfileView({ dashboard, token, auditor, auditors, onUpdate }: { dashboard: Dashboard | null; token: string; auditor: Auditor; auditors: Auditor[]; onUpdate: () => Promise<void> }) {
  const [showArchive, setShowArchive] = useState(false);
  const [showMyAudits, setShowMyAudits] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [transfer, setTransfer] = useState({ locationId: "", requestedToId: "", note: "" });
  const [message, setMessage] = useState(""); const [review, setReview] = useState<AuditDetail | null>(null); const [reviewError, setReviewError] = useState("");
  if (!dashboard) return <p>Loading…</p>;
  const isGod = dashboard.isGodAdmin;
  const requestTransfer = async (event: FormEvent) => { event.preventDefault(); try { await request("/audit-transfer-requests", token, { method: "POST", body: JSON.stringify(transfer) }); setTransfer({ locationId: "", requestedToId: "", note: "" }); setMessage("Transfer request sent to the selected auditor."); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to request a transfer."); } };
  const decide = async (requestId: string, accepted: boolean) => { try { await request(`/audit-transfer-requests/${requestId}/decision`, token, { method: "POST", body: JSON.stringify({ accepted }) }); setMessage(accepted ? "Transfer accepted. You are now assigned to audit this location." : "Transfer request rejected."); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to respond to transfer."); } };
  const reviewAudit = async (auditId: string) => { setReviewError(""); try { setReview(await request<AuditDetail>(`/audits/${auditId}`, token)); } catch (reason) { setReviewError(reason instanceof Error ? reason.message : "Unable to load the audit."); } };
  return <section>
    <div className="heading audit-heading"><div><h1>{isGod ? "All submitted audits" : showMyAudits ? "My submitted audits" : "My audits & transfers"}</h1><p>{isGod ? "Audits awaiting review by Chuck. Reviewed audits are in Archived audits." : showMyAudits ? "Your submitted audits, newest first." : "Manage location transfers or open My submitted audits to view your history."}</p></div>{canAssignLocations(auditor) && <div className="archive-navigation"><button className="back" onClick={() => { setShowArchive(!showArchive); setReview(null); }}>{showArchive ? "← Back to unreviewed audits" : "Archived audits"}</button></div>}{!isGod && <div className="archive-navigation"><button className="back" onClick={() => { setShowMyAudits(!showMyAudits); setAuditPage(1); setReview(null); }}>{showMyAudits ? "← Back to transfers" : "My submitted audits"}</button></div>}</div>
    {message && <p className="success-message">{message}</p>}{reviewError && <p className="error">{reviewError}</p>}
    {!isGod && !showMyAudits && <CoverageDashboardNotice dashboard={dashboard} />}
    {review && <AuditReview audit={review} token={token} auditor={auditor} onClose={() => setReview(null)} onArchived={async () => { setReview(null); setMessage("Audit marked as reviewed and moved to Archived audits."); await onUpdate(); }} />}{showArchive && canAssignLocations(auditor) && <AuditArchive token={token} onReview={reviewAudit} />}
    {!isGod && !showMyAudits && <div className="profile-grid">{/* Hidden: assigned locations are already available in the Locations tab.
<article className="panel"><h2>My assigned locations</h2>{dashboard.ownedLocations.length ? <ul>{dashboard.ownedLocations.map((location) => <li key={location.id}>{location.locationName}</li>)}</ul> : <p className="empty">No locations are assigned to you yet.</p>}</article>
*/}{auditor.canAudit && <form className="panel" onSubmit={requestTransfer}><h2>Transfer a location</h2><p>Request another auditor to take over auditing this location.</p><label>My location<select value={transfer.locationId} onChange={(event) => setTransfer({ ...transfer, locationId: event.target.value })} required><option value="">Choose location</option>{dashboard.ownedLocations.map((location) => <option key={location.id} value={location.id}>{location.locationName}</option>)}</select></label><label>Transfer to<select value={transfer.requestedToId} onChange={(event) => setTransfer({ ...transfer, requestedToId: event.target.value })} required><option value="">Choose auditor</option>{auditors.filter((item) => item.id !== auditor.id).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><label>Note (optional)<textarea value={transfer.note} onChange={(event) => setTransfer({ ...transfer, note: event.target.value })} placeholder="Reason or handoff detail" /></label><button disabled={!dashboard.ownedLocations.length}>Send request</button></form>}</div>}
    {!isGod && !showMyAudits && <div className="profile-grid"><article className="panel"><h2>Incoming transfer requests</h2>{dashboard.incomingTransfers.length ? <div className="audit-list">{dashboard.incomingTransfers.map((item) => <div key={item.id}><strong>{item.locationName}</strong><span>Requested by {item.senderName}{item.note ? ` · ${item.note}` : ""}</span><div><button onClick={() => void decide(item.id, true)}>Accept</button><button className="secondary" onClick={() => void decide(item.id, false)}>Reject</button></div></div>)}</div> : <p className="empty">No incoming transfer requests.</p>}</article><article className="panel"><h2>Requests I sent</h2>{dashboard.sentTransfers.length ? <div className="audit-list">{dashboard.sentTransfers.map((item) => <div key={item.id}><strong>{item.locationName}</strong><span>To {item.recipientName} · {item.status}</span></div>)}</div> : <p className="empty">No transfer requests sent.</p>}</article></div>}
    {!showArchive && (!isGod || !review) && (isGod || showMyAudits) && <div className="audit-results"><article className="panel"><h2>{isGod ? "Awaiting review" : "My submitted audits"}</h2>{dashboard.receivedAudits.length ? <div className="audit-list">{(isGod ? dashboard.receivedAudits : dashboard.receivedAudits.slice((auditPage - 1) * 25, auditPage * 25)).map((audit) => <div key={audit.id}><strong>{audit.locationName} · {audit.binderName}</strong><span>{formatAuditDate(audit.auditDate)} · audited by {audit.auditorName} · {audit.exceptionCount} exception{audit.exceptionCount === 1 ? "" : "s"}</span><button onClick={() => void reviewAudit(audit.id)}>Review audit</button></div>)}</div> : <p className="empty">No submitted audits yet.</p>}{!isGod && dashboard.receivedAudits.length > 25 && <div className="archive-pagination"><button className="back" disabled={auditPage === 1} onClick={() => { setAuditPage(auditPage - 1); setReview(null); }}>Previous</button><span>Page {auditPage} of {Math.ceil(dashboard.receivedAudits.length / 25)}</span><button className="back" disabled={auditPage * 25 >= dashboard.receivedAudits.length} onClick={() => { setAuditPage(auditPage + 1); setReview(null); }}>Next</button></div>}</article></div>}
  </section>;
}

function AuditReviewContents({ audit, onClose }: { audit: AuditDetail; onClose: () => void }) { const statusLabel = (result: Result) => result === "current" ? "Current" : result === "past" ? "Past only" : result === "missing" ? "Missing" : "Not applicable"; return <article className="panel"><button className="back" onClick={onClose}>← Close audit review</button><h2>{audit.locationName} · {audit.binderName}</h2><p>{formatAuditDate(audit.auditDate)} · audited by {audit.auditorName}</p><div className="audit-list">{audit.responses.map((answer) => <div key={answer.sectionId}><strong>{sections.find((section) => section.id === answer.sectionId)?.title ?? answer.sectionId}</strong><span>{answer.results.map(statusLabel).join(" + ")}{answer.comment ? ` · ${answer.comment}` : ""}</span></div>)}</div>{audit.overallComment && <div className="overall-comment"><strong>Overall audit comments</strong><p>{audit.overallComment}</p></div>}</article>; }

type ArchivedAudit = { id: string; auditDate: string; reviewedAt: string; locationName: string; binderName: string; auditorName: string };
function AuditArchive({ token, onReview }: { token: string; onReview: (id: string) => Promise<void> }) {
  const [people, setPeople] = useState<Array<{ id: string; displayName: string; auditCount: number }>>([]);
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ audits: ArchivedAudit[]; hasMore: boolean }>({ audits: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    const load = async () => {
      try {
        if (!selected) {
          const result = await request<typeof people>("/audit-archive/auditors", token);
          if (!cancelled) setPeople(result);
        } else {
          const result = await request<typeof data>(`/audit-archive?auditorId=${encodeURIComponent(selected)}&page=${page}`, token);
          if (!cancelled) setData(result);
        }
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load archive."); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [token, selected, page]);
  const grouped = new Map<string, ArchivedAudit[]>();
  for (const audit of data.audits) grouped.set(audit.auditDate, [...(grouped.get(audit.auditDate) ?? []), audit]);
  return <section className="audit-archive"><h2>Archived audits</h2>
    {selected && <button className="back" onClick={() => { setSelected(""); setPage(1); }}>← All auditors</button>}
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p>Loading archived audits…</p> : !error && (!selected ? <div className="location-grid">
      {people.map((person) => <article className="location-card" key={person.id}><h2>{person.displayName}</h2><p>{person.auditCount} archived audit{person.auditCount === 1 ? "" : "s"}</p><button onClick={() => { setSelected(person.id); setPage(1); }}>View archived audits</button></article>)}
      {!people.length && <p>No auditors to display.</p>}
    </div> : <div><h3>{people.find((person) => person.id === selected)?.displayName}</h3>
      {Array.from(grouped, ([date, audits]) => <article className="panel proposals" key={date}><h3>{formatAuditDate(date)}</h3><div className="audit-list">{audits.map((audit) => <div key={audit.id}><strong>{audit.locationName} · {audit.binderName}</strong><span>Reviewed by Chuck · {new Date(audit.reviewedAt).toLocaleString()}</span><button onClick={() => void onReview(audit.id)}>View audit</button></div>)}</div></article>)}
      {!data.audits.length && <p>No archived audits for this auditor.</p>}
      <div className="archive-pagination"><button className="back" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="back" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>)}
  </section>;
}

function AuditReview({ audit, token, auditor, onClose, onArchived }: { audit: AuditDetail; token: string; auditor: Auditor; onClose: () => void; onArchived: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const archive = async () => {
    setBusy(true); setError("");
    try { await request(`/audits/${audit.id}/review`, token, { method: "POST" }); await onArchived(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive audit."); }
    finally { setBusy(false); }
  };
  return <div className="audit-review"><AuditReviewContents audit={audit} onClose={onClose} />
    {audit.reviewedAt ? <p className="success-message">Reviewed by Chuck · {new Date(audit.reviewedAt).toLocaleString()}</p> : auditor.email.toLowerCase() === "charles.weaver@compass-usa.com" && <div className="archive-action"><button disabled={busy} onClick={() => void archive()}>{busy ? "Archiving…" : "Mark as reviewed & archive"}</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

function PasswordResetForm({ token, auditors }: { token: string; auditors: Auditor[] }) {
  const [auditorId, setAuditorId] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(""); setMessage("");
    if (temporaryPassword !== confirmation) { setError("Temporary passwords do not match."); return; }
    const target = auditors.find((item) => item.id === auditorId);
    if (!target) { setError("Choose an account."); return; }
    setBusy(true);
    try {
      await request(`/auditors/${auditorId}/reset-password`, token, { method: "POST", body: JSON.stringify({ adminPassword, temporaryPassword }) });
      setMessage(`Password reset for ${target.displayName}. Share the temporary password privately. They have been signed out and must create a new password at their next login.`);
      setAuditorId("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reset password."); }
    finally { setAdminPassword(""); setTemporaryPassword(""); setConfirmation(""); setBusy(false); }
  };
  return <form className="panel proposals password-reset" onSubmit={submit}>
    <h2>Reset an account password</h2>
    <p>Set a temporary password for an auditor, including Chuck. Resetting signs them out and requires a new password at next login.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <label>Account<select value={auditorId} onChange={(event) => { setAuditorId(event.target.value); setMessage(""); }} required><option value="">Choose an account</option>{auditors.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.email}</option>)}</select></label>
      <label>Temporary password<input type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
      <small>At least 12 characters with upper- and lower-case letters, a number, and a symbol.</small>
      <label>Confirm temporary password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={12} required /></label>
      <label>Your current Chartwells Admin password<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" required /></label>
      <button type="submit">{busy ? "Resetting…" : "Reset password"}</button>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
  </form>;
}

function AdminView({ token, auditors, canAssignOwner, canResetPasswords, onUpdate }: { token: string; auditors: Auditor[]; canAssignOwner: boolean; canResetPasswords: boolean; onUpdate: () => Promise<void> }) {
  const [newAuditor, setNewAuditor] = useState({ displayName: "", email: "" }); const [location, setLocation] = useState({ areaName: "", locationName: "", binderName: "", ownerAuditorId: "" }); const [message, setMessage] = useState("");
  const addAuditor = async (event: FormEvent) => { event.preventDefault(); try { await request("/auditors", token, { method: "POST", body: JSON.stringify(newAuditor) }); setNewAuditor({ displayName: "", email: "" }); setMessage("Auditor added. Share the staging temporary password securely; they must replace it when they first sign in."); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to add auditor."); } };
  const removeAuditor = async (item: Auditor) => { if (!window.confirm(`Remove ${item.displayName} as an active auditor?`)) return; try { await request(`/auditors/${item.id}`, token, { method: "DELETE" }); setMessage(`${item.displayName} was removed as an active auditor.`); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to remove auditor."); } };
  const setGodAdmin = async (item: Auditor, isGodAdmin: boolean) => { const action = isGodAdmin ? "make" : "remove"; if (!window.confirm(`${isGodAdmin ? "Give" : "Remove"} Admin access ${isGodAdmin ? "to" : "from"} ${item.displayName}? They will continue to have auditor access.`)) return; try { await request(`/auditors/${item.id}/god-admin`, token, { method: "PATCH", body: JSON.stringify({ isGodAdmin }) }); setMessage(`${item.displayName} is ${isGodAdmin ? "now" : "no longer"} a Admin and remains an active auditor.`); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : `Unable to ${action} Admin access.`); } };
  const addLocation = async (event: FormEvent) => { event.preventDefault(); try { await request("/locations", token, { method: "POST", body: JSON.stringify(location) }); setLocation({ areaName: "", locationName: "", binderName: "", ownerAuditorId: "" }); setMessage("Location and binder added."); await onUpdate(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to add location."); } };
  return <section><div className="heading"><div><h1>Admin</h1><p>Admins directly manage auditors and location assignments. Admin is additional to, not instead of, auditor access.</p></div></div>{message && <p className="success-message">{message}</p>}<div className="management-grid"><form className="panel" onSubmit={addAuditor}><h2>Add auditor</h2><label>Name<input value={newAuditor.displayName} onChange={(event) => setNewAuditor({ ...newAuditor, displayName: event.target.value })} required /></label><label>Compass email<input type="email" value={newAuditor.email} onChange={(event) => setNewAuditor({ ...newAuditor, email: event.target.value })} placeholder="name@compass-usa.com" required /></label><button>Add auditor</button><small>New auditors must replace the staging temporary password at first sign-in.</small></form><form className="panel" onSubmit={addLocation}><h2>Add location</h2><label>Area<input value={location.areaName} onChange={(event) => setLocation({ ...location, areaName: event.target.value })} required /></label><label>Location<input value={location.locationName} onChange={(event) => setLocation({ ...location, locationName: event.target.value })} required /></label><label>Binder<input value={location.binderName} onChange={(event) => setLocation({ ...location, binderName: event.target.value })} placeholder="Binder #1" required /></label>{canAssignOwner && <label>Assigned auditor<select value={location.ownerAuditorId} onChange={(event) => setLocation({ ...location, ownerAuditorId: event.target.value })}><option value="">Unassigned for now</option>{auditors.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label>}<button>Add location</button></form></div>{canResetPasswords && <PasswordResetForm token={token} auditors={auditors} />}<article className="panel proposals"><h2>Active auditors</h2>{auditors.length ? auditors.map((item) => <div className="proposal" key={item.id}><div><strong>{item.displayName}{item.isGodAdmin ? " · Admin" : ""}</strong><span>{item.email}</span></div><div>{!item.isGodAdmin && <button className="secondary" onClick={() => void setGodAdmin(item, true)}>Make Admin</button>}{item.isGodAdmin && <button className="secondary" onClick={() => void setGodAdmin(item, false)}>Remove Admin</button>}{!item.isGodAdmin && <button className="secondary" onClick={() => void removeAuditor(item)}>Remove</button>}</div></div>) : <p className="empty">No active auditors.</p>}</article></section>;
}

function AuditForm({ token, auditor, selection, onBack, onSubmitted }: { token: string; auditor: Auditor; selection: { location: Location; binder: Binder }; onBack: () => void; onSubmitted: () => void }) {
  const [responses, setResponses] = useState<Record<string, AuditResponse>>(blankResponses); const [overallComment, setOverallComment] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const auditDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const update = (id: string, patch: Partial<AuditResponse>) => setResponses((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const toggleResult = (id: string, result: Result) => setResponses((current) => { const answer = current[id]; const results = answer.results.includes(result) ? answer.results.filter((item) => item !== result) : [...answer.results, result]; return { ...current, [id]: { ...answer, results } }; });
  const submit = async () => { setSaving(true); setError(""); try { await request("/audits", token, { method: "POST", body: JSON.stringify({ binderId: selection.binder.id, overallComment, responses: sections.map((section) => ({ sectionId: section.id, ...responses[section.id] })) }) }); onSubmitted(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to submit audit."); } finally { setSaving(false); } };
  return <main className="app-shell"><header><div className="brand">HANDSHAKE <span>WEEKLY AUDITS</span></div><div className="account">{auditor.displayName}</div></header><div className="page"><button className="back" onClick={onBack}>← Back to locations</button><div className="heading"><div><div className="breadcrumb">{selection.location.locationName} / {selection.binder.binderName}</div><h1>Checklist evidence</h1><p>Assigned auditor: {selection.location.ownerName}. Select any status options that apply; all selections and comments are optional.</p></div><div className="audit-date"><span>Audit date</span><strong>{auditDate}</strong></div></div>{error && <p className="error">{error}</p>}<section className="audit-card">{sections.map((section) => { const answer = responses[section.id]; return <article className="section" key={section.id}><div className="section-copy"><h2>{section.title}</h2>{section.detail && <p>{section.detail}</p>}</div><div className="choices" role="group" aria-label={`${section.title} status`}><span className="choice-instruction">Select any that apply</span>{(["current", "past", "missing", "not_applicable"] as Result[]).map((result) => { const checked = answer.results.includes(result); return <label key={result} className={checked ? `choice ${result}` : "choice"}><input type="checkbox" checked={checked} onChange={() => toggleResult(section.id, result)} /><span>{result === "current" ? "Current" : result === "past" ? "Past only" : result === "missing" ? "Missing" : "Not applicable"}</span></label>; })}</div><label className="comment"><span>Section comment (optional)</span><textarea value={answer.comment} onChange={(event) => update(section.id, { comment: event.target.value })} placeholder="Add a note for this section." /></label></article>; })}<label className="overall-comment"><span>Overall audit comments (optional)</span><textarea value={overallComment} onChange={(event) => setOverallComment(event.target.value)} placeholder="Add any general observations, follow-up, or context for this audit." /></label></section><footer><div>All checklist selections and comments are optional.</div><button disabled={saving} onClick={submit}>{saving ? "Submitting…" : "Submit audit"}</button></footer></div></main>;
}
