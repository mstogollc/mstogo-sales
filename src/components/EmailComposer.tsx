import { useState, type FC } from "react";
import { api, type AnalyzeResponse } from "../api";
import { useActiveProspect } from "../lib/prospect";

interface Props {
  analysis: AnalyzeResponse | null;
}

export const EmailComposer: FC<Props> = ({ analysis }) => {
  const prospect = useActiveProspect();
  const businessName = analysis?.lead.businessName || prospect?.businessName;
  const [contactName, setContactName] = useState(prospect?.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(prospect?.contactEmail ?? "");
  const [tone, setTone] = useState<"warm" | "direct" | "consultative">("consultative");
  const [intent, setIntent] = useState<"first_touch" | "follow_up" | "proposal_intro" | "discovery_recap">(
    "first_touch",
  );
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setError(null);
    setDrafting(true);
    try {
      const insight = analysis?.placeProfile.summary;
      const draft = await api.draftEmail({
        businessName,
        contactName: contactName || undefined,
        insight,
        tone,
        intent,
        recommendedTier: analysis?.recommendation.tier,
      });
      setSubject(draft.subject);
      setText(draft.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft an email.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleRewrite(mode: string) {
    if (!text.trim()) return;
    setError(null);
    setRewriting(true);
    try {
      const r = await api.rewrite({ text, tone: mode, audience: contactName || undefined });
      setText(r.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rewrite failed.");
    } finally {
      setRewriting(false);
    }
  }

  async function handleSend() {
    setError(null);
    setDeliveryStatus(null);
    if (!contactEmail || !subject.trim() || !text.trim()) {
      setError("Add a recipient, subject, and body before sending.");
      return;
    }
    setSending(true);
    try {
      const res = await api.sendEmail({
        to: contactEmail,
        subject,
        text,
        kind: intent === "proposal_intro" ? "proposal" : "prospect",
      });
      if (res.delivery.status === "sent") {
        setDeliveryStatus("Sent — Resend confirmed delivery.");
      } else if (res.delivery.status === "queued_local") {
        setDeliveryStatus(
          "Saved locally. Resend isn't connected yet, so this draft is ready to send once the domain is verified.",
        );
      } else {
        setDeliveryStatus(`Could not send: ${res.delivery.reason}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card">
      <h2>Email composer</h2>
      <p className="subtitle">Draft a first-touch or follow-up — branded, on-message, and ready to send.</p>

      {businessName && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Outreach for <strong>{businessName}</strong>
        </div>
      )}

      <div className="row">
        <div>
          <label htmlFor="cn">Contact name</label>
          <input id="cn" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ce">Contact email</label>
          <input
            id="ce"
            type="email"
            placeholder="owner@example.com"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="tone">Tone</label>
          <select id="tone" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}>
            <option value="consultative">Consultative</option>
            <option value="warm">Warm</option>
            <option value="direct">Direct</option>
          </select>
        </div>
        <div>
          <label htmlFor="intent">Intent</label>
          <select id="intent" value={intent} onChange={(e) => setIntent(e.target.value as typeof intent)}>
            <option value="first_touch">First touch</option>
            <option value="follow_up">Follow up</option>
            <option value="proposal_intro">Proposal intro</option>
            <option value="discovery_recap">Discovery recap</option>
          </select>
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={handleDraft} disabled={drafting}>
          {drafting ? "Drafting…" : analysis ? "Draft from analysis" : "Draft cold outreach"}
        </button>
        <button className="ghost" onClick={() => handleRewrite("shorter")} disabled={!text || rewriting}>
          Shorten
        </button>
        <button className="ghost" onClick={() => handleRewrite("more_confident")} disabled={!text || rewriting}>
          More confident
        </button>
        <button className="ghost" onClick={() => handleRewrite("warm")} disabled={!text || rewriting}>
          Warmer
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <label htmlFor="subject">Subject</label>
        <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <label htmlFor="body">Email body</label>
        <textarea
          id="body"
          style={{ minHeight: 220 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="primary" onClick={handleSend} disabled={sending}>
          {sending ? "Sending…" : "Send email"}
        </button>
      </div>

      {deliveryStatus && (
        <div className={`notice ${deliveryStatus.startsWith("Could not") ? "warn" : ""}`} style={{ marginTop: 12 }}>
          {deliveryStatus}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
};
