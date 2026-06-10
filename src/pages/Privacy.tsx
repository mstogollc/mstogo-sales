import type { FC } from "react";
import { BrandedShell } from "./BrandedShell";

const EFFECTIVE = "May 2026";

export const Privacy: FC = () => {
  return (
    <BrandedShell title="Privacy Policy" subtitle={`Effective ${EFFECTIVE}`}>
      <div className="branded-prose">
        <p>
          MS to Go, LLC ("MS2GO," "we," "us") operates the Sales Command Center portal at
          {" "}
          <a href="https://portal.mstogo.com/">portal.mstogo.com</a>. This Privacy Policy explains what
          information we collect, how we use it, and the choices you have.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account details</strong> you provide when you sign in or connect a service, such as
            your name, email address, and business affiliation.
          </li>
          <li>
            <strong>Business information</strong> you enter into the portal, such as prospect details,
            proposals, and outreach drafts.
          </li>
          <li>
            <strong>Integration data</strong> from services you choose to connect (for example, signature
            and email providers). We only request the access needed to deliver the features you use.
          </li>
          <li>
            <strong>Usage and device information</strong> such as basic log data, browser type, and
            timestamps, used to keep the portal reliable and secure.
          </li>
        </ul>

        <h2>How we use information</h2>
        <ul>
          <li>To provide and improve the Sales Command Center experience.</li>
          <li>To send and track documents, proposals, and messages you initiate.</li>
          <li>To secure accounts, prevent abuse, and troubleshoot issues.</li>
          <li>To communicate service updates, security notices, and respond to support requests.</li>
        </ul>

        <h2>How we share information</h2>
        <p>
          We do not sell your personal information. We share information only with service providers that
          help us operate the portal (for example, hosting, email delivery, and signature platforms), and
          only as needed to deliver the services you've requested. We may disclose information when
          required by law or to protect the safety of our users and our business.
        </p>

        <h2>Data retention</h2>
        <p>
          We retain information for as long as your account is active or as needed to provide the
          service. You may request deletion of your account data by contacting us at the address below.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>You can disconnect any linked integration from the portal at any time.</li>
          <li>You can request access to, correction of, or deletion of your account information.</li>
          <li>You can opt out of non-essential email communications.</li>
        </ul>

        <h2>Security</h2>
        <p>
          We use industry-standard safeguards to protect your information in transit and at rest. No
          system is perfectly secure, so we encourage strong passwords and prompt reporting of any
          suspected unauthorized access.
        </p>

        <h2>Children's privacy</h2>
        <p>
          The portal is intended for business use and is not directed to children under 13. We do not
          knowingly collect information from children.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be reflected by updating the
          effective date above and, where appropriate, by notifying account holders.
        </p>

        <h2>Contact us</h2>
        <p>
          Questions or requests about your information? Email{" "}
          <a href="mailto:mstogollc@gmail.com">mstogollc@gmail.com</a>.
        </p>
      </div>
    </BrandedShell>
  );
};
