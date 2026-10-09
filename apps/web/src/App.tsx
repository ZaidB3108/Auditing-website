import { useMemo, useState } from "react";

type AuditSection = { id: string; title: string; detail?: string };
const sections: AuditSection[] = [
  { id: "safety", title: "Safety Topic and Sign-off" },
  { id: "opening", title: "Opening Checklist" },
  { id: "mid", title: "Mid Checklist" },
  { id: "closing", title: "Closing Checklist" },
  { id: "cooler", title: "Cooler Temp Logs" },
  { id: "two-hour", title: "2 hour food temp logs" },
  { id: "protein", title: "Protein Temp Logs Maintained with MGR Sign-off" },
  { id: "test", title: "Checklist Test Item(s)", detail: "Document the test item in the section comment." }
];

type Result = "current" | "past" | "missing";
type Response = { result: Result; comment: string };
const initial = Object.fromEntries(sections.map((section) => [section.id, { result: "current" as Result, comment: "" }]));

export function App() {
  const [responses, setResponses] = useState<Record<string, Response>>(initial);
  const [submitted, setSubmitted] = useState(false);
  const exceptions = useMemo(() => Object.values(responses).filter(({ result }) => result !== "current").length, [responses]);
  const update = (id: string, patch: Partial<Response>) => setResponses((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const canSubmit = sections.filter(({ id }) => responses[id].result !== "current").every(({ id }) => responses[id].comment.trim().length > 0);

  if (submitted) return <main className="success"><h1>Audit submitted</h1><p>Food Court · Binder #1 has been recorded. {exceptions} follow-up item{exceptions === 1 ? "" : "s"} will appear in audit history.</p><button onClick={() => setSubmitted(false)}>Return to audit</button></main>;

  return <main className="app-shell">
    <header><div className="brand">HANDSHAKE <span>DAILY AUDIT</span></div><div className="auditor">Signed in as Shannon</div></header>
    <div className="page">
      <div className="breadcrumb">Daily audit / Union Food / Food Court / Binder #1</div>
      <div className="heading"><div><h1>Checklist evidence</h1><p>Record the documentation visible during this audit. Each section has its own comment field.</p></div><div className="date">March 18, 2026</div></div>
      <div className="notice">Location owner: Chuck · You may audit this location because it is not assigned to you.</div>
      <section className="audit-card">
        {sections.map((section) => { const response = responses[section.id]; const requiresComment = response.result !== "current"; return <article className="section" key={section.id}>
          <div className="section-copy"><h2>{section.title}</h2>{section.detail && <p>{section.detail}</p>}</div>
          <div className="choices" aria-label={`${section.title} evidence status`}>
            {(["current", "past", "missing"] as Result[]).map((result) => <button key={result} className={response.result === result ? `choice ${result}` : "choice"} onClick={() => update(section.id, { result })}>{result === "current" ? "Current" : result === "past" ? "Past only" : "Missing"}</button>)}
          </div>
          <label className="comment"><span>Section comment{requiresComment ? " (required)" : " (optional)"}</span><textarea value={response.comment} onChange={(event) => update(section.id, { comment: event.target.value })} placeholder={requiresComment ? "Explain the issue or follow-up needed." : "Add a note for this section."} /></label>
        </article>; })}
      </section>
      <footer><div>{exceptions ? `${exceptions} section${exceptions === 1 ? "" : "s"} need follow-up comments.` : "All sections are current."}</div><button disabled={!canSubmit} onClick={() => setSubmitted(true)}>Submit audit</button></footer>
    </div>
  </main>;
}
