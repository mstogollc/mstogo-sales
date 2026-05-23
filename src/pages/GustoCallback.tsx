import { useMemo, type FC } from "react";
import { BrandedShell } from "./BrandedShell";

type Status = "success" | "error" | "pending";

function readParams(): { status: Status; errorLabel?: string } {
  if (typeof window === "undefined") return { status: "pending" };
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error") || params.get("error_description");
  const code = params.get("code");
  if (error) {
    const label = error.replace(/[_-]+/g, " ").trim();
    return { status: "error", errorLabel: label || "unknown" };
  }
  if (code) return { status: "success" };
  return { status: "pending" };
}

export const GustoCallback: FC = () => {
  const { status, errorLabel } = useMemo(readParams, []);

  if (status === "success") {
    return (
      <BrandedShell
        title="You're connected"
        subtitle="Your MS2GO account is now linked to Gusto. You can close this window and return to the portal."
      >
        <div className="branded-status branded-status-success" role="status">
          <span className="branded-status-dot" aria-hidden="true" />
          Connection complete
        </div>
        <p className="branded-body">
          Payroll and onboarding events will now flow into your secure MS2GO workspace. No further action is needed.
        </p>
        <div className="branded-actions">
          <a className="branded-button branded-button-primary" href="https://portal.mstogo.com/">
            Return to portal
          </a>
        </div>
      </BrandedShell>
    );
  }

  if (status === "error") {
    return (
      <BrandedShell
        title="We couldn't finish connecting Gusto"
        subtitle="Your account wasn't linked. Please try again, or contact MS2GO support if the issue continues."
      >
        <div className="branded-status branded-status-error" role="alert">
          <span className="branded-status-dot" aria-hidden="true" />
          Connection not completed
        </div>
        {errorLabel && (
          <p className="branded-body branded-muted">
            Reason reported: <strong>{errorLabel}</strong>
          </p>
        )}
        <div className="branded-actions">
          <a className="branded-button branded-button-primary" href="https://portal.mstogo.com/">
            Try again
          </a>
          <a className="branded-button branded-button-ghost" href="mailto:mstogollc@gmail.com">
            Contact support
          </a>
        </div>
      </BrandedShell>
    );
  }

  return (
    <BrandedShell
      title="Finishing your Gusto connection"
      subtitle="Please keep this tab open while we complete the secure handshake."
    >
      <div className="branded-status branded-status-pending" role="status">
        <span className="branded-status-dot" aria-hidden="true" />
        Working on it
      </div>
      <p className="branded-body">
        If this page doesn't update in a few moments, return to the portal and try connecting Gusto again.
      </p>
      <div className="branded-actions">
        <a className="branded-button branded-button-ghost" href="https://portal.mstogo.com/">
          Back to portal
        </a>
      </div>
    </BrandedShell>
  );
};
