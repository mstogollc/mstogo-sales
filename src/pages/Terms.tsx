import type { FC } from "react";
import { BrandedShell } from "./BrandedShell";

const EFFECTIVE = "May 2026";

export const Terms: FC = () => {
  return (
    <BrandedShell title="Terms of Service" subtitle={`Effective ${EFFECTIVE}`}>
      <div className="branded-prose">
        <p>
          Welcome to the MS2GO Sales Command Center portal, operated by MS to Go, LLC ("MS2GO," "we,"
          "us"). By accessing or using the portal at{" "}
          <a href="https://portal.mstogo.com/">portal.mstogo.com</a>, you agree to these Terms of Service.
        </p>

        <h2>Eligibility and accounts</h2>
        <p>
          You must be authorized to act on behalf of your business to use the portal. You are responsible
          for keeping your account credentials confidential and for activity that happens under your
          account.
        </p>

        <h2>Acceptable use</h2>
        <ul>
          <li>Don't use the portal to send unlawful, deceptive, or harassing communications.</li>
          <li>Don't attempt to disrupt, reverse engineer, or gain unauthorized access to the service.</li>
          <li>
            Follow the terms of any third-party services you connect (for example, signature or email
            providers).
          </li>
          <li>Only upload content you have the right to share.</li>
        </ul>

        <h2>Connected services</h2>
        <p>
          The portal can connect to third-party services you authorize. Those services are governed by
          their own terms and privacy practices. You can disconnect any integration from the portal at
          any time.
        </p>

        <h2>Customer content</h2>
        <p>
          You retain ownership of the business information and content you put into the portal. You grant
          MS2GO the limited rights needed to operate, secure, and improve the service on your behalf.
        </p>

        <h2>Service availability</h2>
        <p>
          We work to keep the portal available and reliable, but we don't guarantee uninterrupted access.
          We may update or change features to improve the service.
        </p>

        <h2>Fees</h2>
        <p>
          If your account includes paid features, applicable fees and billing terms will be communicated
          separately. Non-payment may result in suspension of paid features.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using the portal at any time. We may suspend or terminate access if these Terms
          are violated or if continued access poses a risk to other users or the service.
        </p>

        <h2>Disclaimers</h2>
        <p>
          The portal is provided on an "as is" and "as available" basis. To the fullest extent permitted
          by law, MS2GO disclaims warranties of merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, MS2GO will not be liable for indirect, incidental,
          special, or consequential damages arising from your use of the portal.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these Terms from time to time. Material changes will be reflected by updating the
          effective date above. Continued use of the portal after changes take effect means you accept
          the updated Terms.
        </p>

        <h2>Contact us</h2>
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:mstogollc@gmail.com">mstogollc@gmail.com</a>.
        </p>
      </div>
    </BrandedShell>
  );
};
