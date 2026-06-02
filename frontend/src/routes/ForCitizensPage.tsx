// Phase 13.6 — ForCitizensPage
//
// Per-persona pitch for the citizen. Covers the three citizen roles
// (Earn / Use / Provide) per the onboarding-hero-earn-use binding,
// the data revenue line per citizen-data-as-product-revenue, and
// the Sahayak path per sahayak-no-smartphone-onboarding.

import { Link } from 'react-router-dom';
import { Card, Action, Badge } from '@/components/ui';
import { MarketingLayout } from '@/components/MarketingLayout';
import { useDocumentMeta } from '@/lib/use-document-meta';

export function ForCitizensPage() {
  useDocumentMeta({
    title: 'For citizens · Bharat OS — You own your data',
    description:
      "Bharat OS for citizens. On-device summariser + PII redactor + skill agents (electricity bill, consumer complaint, PM-KISAN). Sell your data per-data-point with signed consent + revocable cascade. Sahayak path for the 700M without smartphones.",
    ogType: 'website'
  });
  return (
    <MarketingLayout>
      <section className="mb-12">
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">
          For citizens
        </p>
        <h1 className="text-display font-semibold text-text">
          You own your data. You decide who sees it. You get paid.
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-text-muted">
          Every other AI platform takes your data implicitly. Bharat OS
          makes the trade explicit, signed, revocable, and paid.
        </p>
      </section>

      {/* The three modes */}
      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          Three ways to use Bharat OS
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Use" subtitle="Free, on-device">
            <p className="text-body text-text">
              Summarise an electricity bill, redact PII from a document
              before sending it, draft a Consumer Protection Act
              complaint, check your PM-KISAN status. All on-device. No
              ads. No upselling. No data leaves your phone.
            </p>
          </Card>
          <Card title="Earn" subtitle="Get paid for your data">
            <p className="text-body text-text">
              Publish data offers — "₹50 for each of my electricity-bill
              summaries, for academic research only, max 100 sales" —
              and get paid when sponsors purchase. Revocable at any
              time. Cascade on identity erase.
            </p>
          </Card>
          <Card title="Provide" subtitle="Bharat-OS-native marketplace">
            <p className="text-body text-text">
              Drive a cab, cook, clean, run a kirana, work in skilled
              trades — and serve citizens through a native marketplace,
              not an Ola/Uber re-skin. KYC L1, trust passport, signed
              attestations, real earnings.
            </p>
          </Card>
        </div>
      </section>

      {/* Earn — the data revenue line */}
      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          The data revenue line, in detail
        </h2>
        <p className="mb-3 text-body text-text">
          You publish a sale offer for one of five data point kinds:
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-white p-3">
            <p className="font-semibold text-text">Intent prompts</p>
            <p className="mt-1 text-caption text-text-muted">
              The text of intents you submitted to Bharat OS
              (anonymised; never your reply targets).
            </p>
          </div>
          <div className="rounded-md border border-border bg-white p-3">
            <p className="font-semibold text-text">Document summaries</p>
            <p className="mt-1 text-caption text-text-muted">
              Output of the on-device document summariser (titles,
              TLDRs, bullet structure).
            </p>
          </div>
          <div className="rounded-md border border-border bg-white p-3">
            <p className="font-semibold text-text">PII-redacted text</p>
            <p className="mt-1 text-caption text-text-muted">
              PII-redacted text + redaction trail (counts only; never
              the redacted PII itself).
            </p>
          </div>
          <div className="rounded-md border border-border bg-white p-3">
            <p className="font-semibold text-text">Skill-agent runs</p>
            <p className="mt-1 text-caption text-text-muted">
              Input + output pairs from your SLM-H skill runs
              (consumer complaints / PM-KISAN / bills).
            </p>
          </div>
          <div className="rounded-md border border-border bg-white p-3">
            <p className="font-semibold text-text">
              Federated learning contributions
            </p>
            <p className="mt-1 text-caption text-text-muted">
              Already DP-noised gradient updates from federated rounds
              you participated in.
            </p>
          </div>
        </div>
        <p className="text-body text-text">
          You set the price (₹1 to ₹100,000 per sale), the maximum
          sale count (1 to 1,000), the sponsor purpose allowlist
          (model training, evaluation, safety benchmark, product
          research, academic research, government audit), and the
          expiry (24 hours to 365 days). Sponsors that match your
          purpose list can purchase; each purchase pays into your
          mesh balance. Pause or revoke at any time.
        </p>
      </section>

      {/* For the 700M without smartphones */}
      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          For citizens without a usable smartphone — Sahayak
        </h2>
        <Card
          title="Agent-assisted onboarding"
          subtitle="Phase 14.x — substrate ~70% there"
          actions={<Badge variant="warning">Planned</Badge>}
        >
          <p className="mb-3 text-body text-text">
            ~700 million Indians don't have a usable smartphone today.
            That doesn't mean they should be excluded from Bharat OS.
          </p>
          <p className="mb-3 text-body text-text">
            The Sahayak path mirrors the Snabit / Pronto / PayNearby /
            Eko / Spice Money / Fino model already proven by India's
            Business Correspondent ecosystem: a trained, KYC'd local
            agent uses THEIR device to onboard + transact on behalf of
            the citizen, with a double-signature pattern — every
            action signed by the Sahayak's session AND the citizen's
            biometric.
          </p>
          <p className="text-body text-text">
            The substrate is ~70% there already (KYC L1 + role-extras
            + attachments + DigiLocker). The remaining 30% is the
            Sahayak product layer + partner agreements. Lands in
            Phase 14.x.
          </p>
        </Card>
      </section>

      {/* Privacy posture */}
      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          Privacy guarantees, not promises
        </h2>
        <ul className="space-y-3 text-body text-text">
          <li>
            <span className="font-semibold">Bytes never leave your device</span>{' '}
            without your signed consent. Open DevTools → Network and
            watch nothing happen while the model thinks.
          </li>
          <li>
            <span className="font-semibold">Revocable consent</span> on
            every sponsor read. Once revoked, the sponsor's audit
            bundle still carries the at-sale-time signature but their
            renewed reads stop working.
          </li>
          <li>
            <span className="font-semibold">DPDP §12 erasure cascade</span>{' '}
            wipes every per-identity record in one atomic transaction.
            You can leave Bharat OS in one tap.
          </li>
          <li>
            <span className="font-semibold">Audit-honest history</span>:
            revoked consents and offers stay on screen as "Revoked"
            chips; the ledger keeps the integrity-preserving seq number;
            the personally-identifying fields are redacted.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <Card title="Sign up + try the substrate" subtitle="Investor-pitch MVP">
          <p className="mb-3 text-body text-text">
            Sign up takes 30 seconds via phone-OTP. Your number is the
            only personal field we collect at this stage — everything
            else (name, email, KYC documents) is opt-in per surface and
            gated by signed consent. Install the SLM model pack into
            your browser, and try the three skill agents (electricity
            bill / consumer complaint / PM-KISAN) plus the citizen data
            marketplace.
          </p>
          <Link to="/">
            <Action variant="trust">Sign up + try the demo →</Action>
          </Link>
        </Card>
      </section>
    </MarketingLayout>
  );
}
