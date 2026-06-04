import { useEffect, type FC } from "react";

/**
 * Booking view. The scheduling link is configuration-driven so the team can
 * point it at any Calendly (or other embed-safe) booking page without code
 * changes. Set `VITE_CALENDLY_URL` in the build environment; if it is absent we
 * fall back to the public MS2GO booking page.
 */
const BOOKING_URL = (import.meta.env.VITE_CALENDLY_URL ?? "https://calendly.com/mstogo").trim();

function isCalendly(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("calendly.com");
  } catch {
    return false;
  }
}

export const AppointmentCalendar: FC = () => {
  const calendly = isCalendly(BOOKING_URL);

  useEffect(() => {
    if (!calendly) return;
    const id = "calendly-widget-script";
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    document.body.appendChild(script);
  }, [calendly]);

  return (
    <section className="card">
      <div className="ops-page-head">
        <div>
          <h2>Book an appointment</h2>
          <p className="subtitle">Schedule a meeting or demo directly from the portal.</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="ghost" href={BOOKING_URL} target="_blank" rel="noreferrer">
            Open booking page
          </a>
        </div>
      </div>

      {calendly ? (
        <div
          className="calendly-inline-widget"
          data-url={BOOKING_URL}
          style={{ minWidth: 320, height: 720 }}
        />
      ) : (
        <div className="notice">
          <p style={{ marginTop: 0 }}>Use the link below to book a time that works for you.</p>
          <p style={{ marginBottom: 0 }}>
            <a href={BOOKING_URL} target="_blank" rel="noreferrer">
              {BOOKING_URL}
            </a>
          </p>
        </div>
      )}
    </section>
  );
};
