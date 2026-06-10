import type { FC } from "react";
import { BrandedShell } from "./BrandedShell";

export const DocusignConsentComplete: FC = () => {
  return (
    <BrandedShell
      title="Permissions granted"
      subtitle="Thanks — your MS2GO workspace can now send and track signature requests on your behalf."
    >
      <div className="branded-status branded-status-success" role="status">
        <span className="branded-status-dot" aria-hidden="true" />
        Consent complete
      </div>

      <ol className="branded-steps">
        <li>
          <strong>Return to the portal.</strong> Your account is ready to send and sign documents.
        </li>
        <li>
          <strong>Start a new proposal or agreement.</strong> Signatures will route through your connected account.
        </li>
        <li>
          <strong>Track status in real time.</strong> Updates appear in your MS2GO dashboard automatically.
        </li>
      </ol>

      <div className="branded-actions">
        <a className="branded-button branded-button-primary" href="https://portal.mstogo.com/">
          Open the portal
        </a>
        <a className="branded-button branded-button-ghost" href="mailto:mstogollc@gmail.com">
          Need help?
        </a>
      </div>
    </BrandedShell>
  );
};
