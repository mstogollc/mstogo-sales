import { useState, type FC } from "react";
import { api } from "../api";

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
          <pre className="preview">{output}</pre>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
};
