import { useState, type FC } from "react";
import { api } from "../api";
import { PACKAGE_SYSTEMS, SPEED_TO_LEAD_PLAYBOOK } from "../lib/trainingContent";

/**
 * Print only one document on a page that has several. We tag <body> with the
 * target's class so the print stylesheet can hide the others, then clear it.
 */
function printOnly(target: "playbook" | "notes") {
  if (typeof document === "undefined") return;
  const cls = `printing-${target}`;
  document.body.classList.add(cls);
  const clear = () => {
    document.body.classList.remove(cls);
    window.removeEventListener("afterprint", clear);
  };
  window.addEventListener("afterprint", clear);
  window.print();
}

const PackagePlaybook: FC = () => (
  <section className="card">
    <div className="actions no-print" style={{ marginTop: 0, marginBottom: 12, justifyContent: "space-between" }}>
      <div>
        <h2 style={{ margin: 0 }}>MS2GO package playbook</h2>
        <p className="subtitle" style={{ margin: "4px 0 0" }}>
          What every system does for the customer, and how MS2GO maximizes it. Built for new reps to learn fast and sell
          with confidence.
        </p>
      </div>
      <button className="ghost" type="button" onClick={() => printOnly("playbook")}>
        Print playbook
      </button>
    </div>

    <div className="print-document print-doc-playbook">
      <div className="print-letterhead">
        <span className="print-brand">MS2GO</span>
        <span className="print-brand-sub">Package & Systems Playbook</span>
      </div>

      {PACKAGE_SYSTEMS.map((s) => (
        <div key={s.id} className="playbook-entry" style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 6 }}>{s.name}</h3>
          <p style={{ margin: "0 0 4px" }}>
            <strong>What it is:</strong> {s.whatItIs}
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>What it does for the customer:</strong> {s.customerBenefit}
          </p>
          <p style={{ margin: 0 }}>
            <strong>How MS2GO maximizes it:</strong> {s.howMs2goMaximizes}
          </p>
        </div>
      ))}

      <div className="divider" />
      <h3 style={{ marginBottom: 6 }}>Speed-to-Lead playbook — never miss a call, respond in seconds</h3>
      <p style={{ margin: "0 0 10px" }}>{SPEED_TO_LEAD_PLAYBOOK.promise}</p>

      <p style={{ margin: "0 0 4px" }}>
        <strong>Response SLA</strong>
      </p>
      <ul style={{ marginTop: 0 }}>
        {SPEED_TO_LEAD_PLAYBOOK.sla.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <p style={{ margin: "8px 0 4px" }}>
        <strong>How the system works</strong>
      </p>
      {SPEED_TO_LEAD_PLAYBOOK.steps.map((step) => (
        <p key={step.title} style={{ margin: "0 0 6px" }}>
          <strong>{step.title}:</strong> {step.detail}
        </p>
      ))}

      <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
        {SPEED_TO_LEAD_PLAYBOOK.note}
      </p>
    </div>
  </section>
);

export const TrainingHub: FC = () => {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<"lesson" | "role_play" | "talk_track" | "objection_handling">("lesson");
  const [audience, setAudience] = useState<"new_rep" | "veteran_rep" | "manager">("new_rep");
  const [context, setContext] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    if (!topic.trim()) {
      setError("Pick a topic.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.trainingContent({
        topic,
        format,
        audience,
        context: context || undefined,
      });
      setOutput(res.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate training content.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PackagePlaybook />
      <section className="card">
      <h2>Sales training</h2>
      <p className="subtitle">Generate lessons, talk tracks, role-plays, and objection handlers for the team.</p>

      <div className="row">
        <div>
          <label htmlFor="topic">Topic</label>
          <input
            id="topic"
            placeholder="e.g. selling Growth to restaurants"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="format">Format</label>
          <select id="format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="lesson">Lesson</option>
            <option value="talk_track">Talk track</option>
            <option value="role_play">Role play</option>
            <option value="objection_handling">Objection handling</option>
          </select>
        </div>
        <div>
          <label htmlFor="aud">Audience</label>
          <select id="aud" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            <option value="new_rep">New rep</option>
            <option value="veteran_rep">Veteran rep</option>
            <option value="manager">Manager</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="ctx">Context (optional)</label>
        <textarea
          id="ctx"
          placeholder="What's the scenario? Recent loss, common objection, new vertical, etc."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="primary" onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>

      {output && (
        <>
          <div className="divider" />
          <div className="actions no-print" style={{ marginTop: 0, marginBottom: 12 }}>
            <button className="ghost" type="button" onClick={() => printOnly("notes")}>
              Print assistant help
            </button>
          </div>
          <div className="print-document print-doc-notes">
            <div className="print-letterhead">
              <span className="print-brand">MS2GO</span>
              <span className="print-brand-sub">
                Assistant Help{topic.trim() ? ` · ${topic.trim()}` : ""}
              </span>
            </div>
            <pre className="preview notes-output">{output}</pre>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      </section>
    </>
  );
};
