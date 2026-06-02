// Phase 13.6 — ForSponsorsPage
//
// Per-persona pitch for the sponsor. Covers the three sponsor
// surfaces: labeling marketplace (Phase 10), federated rounds
// (Phase 3.x + 9.0d), citizen data marketplace (Phase 13.5+).

import { Link } from 'react-router-dom';
import { Card, Action, Badge } from '@/components/ui';
import { MarketingLayout } from '@/components/MarketingLayout';
import { useDocumentMeta } from '@/lib/use-document-meta';

export function ForSponsorsPage() {
  useDocumentMeta({
    title: 'For sponsors · Bharat OS — Ethically sourced Indian data',
    description:
      "Bharat OS for AI labs and sponsors. Labeling marketplace + federated learning rounds + per-data-point citizen data purchases. Signed consent + escrow + audit-exportable Ed25519-signed provenance bundles. DPDP §12 compliant. Apache 2.0 substrate.",
    ogType: 'website'
  });
  return (
    <MarketingLayout>
      <section className="mb-12">
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">
          For sponsors
        </p>
        <h1 className="text-display font-semibold text-text">
          Train and evaluate models on real Indian data, ethically.
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-text-muted">
          Bharat OS gives you direct access to Indian citizens and workers
          for labeling, federated training, and per-data-point purchases —
          with signed consent, escrow-locked payments, and audit-exportable
          provenance bundles.
        </p>
      </section>

      {/* Three sponsor surfaces */}
      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          Three ways to source data
        </h2>
        <div className="space-y-4">
          <Card
            title="1. Labeling marketplace"
            subtitle="Phase 10 — workers label your corpus"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="mb-2 text-body text-text">
              Upload a corpus, set per-label payout + QC parameters
              (golden-set rate, minimum worker score, sponsor-review
              sampling rate), launch when escrow funds. Workers across
              India discover the job, label items, and earn into their
              mesh balance. Sponsor-side review queue lets you
              accept / reject with one tap.
            </p>
            <ul className="ml-5 list-disc space-y-1 text-body text-text">
              <li>
                Task kinds: preference pairs, classification, span
                annotation, transcription, safety labels
              </li>
              <li>
                Modalities: text, voice, image
              </li>
              <li>
                IP terms: non-exclusive, exclusive, or CC-BY-4.0
              </li>
              <li>
                Signed audit-export bundle (NDJSON; verifiable Ed25519
                signature; one line per submission)
              </li>
            </ul>
          </Card>

          <Card
            title="2. Federated learning rounds"
            subtitle="Phase 3.x + 9.0d — workers contribute gradients"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="mb-2 text-body text-text">
              Define a round with baseline model hash, max
              participants, payout per update, and an optional LoRA
              config + target task. Workers download the baseline,
              train locally on their own data, submit DP-noised
              gradient updates. Sponsor escrow debits per update.
              Aggregated model hash returns at round completion.
            </p>
            <ul className="ml-5 list-disc space-y-1 text-body text-text">
              <li>Aggregation modes: hash combiner, FedAvg</li>
              <li>
                Optional SLM model pack binding (round trains a specific
                Phi-3 / Gemma variant)
              </li>
              <li>
                Privacy budget enforcement (max epsilon spent across
                participants)
              </li>
              <li>Signed round-export bundle</li>
            </ul>
          </Card>

          <Card
            title="3. Citizen data marketplace"
            subtitle="Phase 13.5 — buy directly from citizens"
            actions={<Badge variant="trust">Shipped (citizen-side)</Badge>}
          >
            <p className="mb-2 text-body text-text">
              Citizens publish per-data-point sale offers (intent prompts,
              document summaries, PII-redacted text, skill runs,
              federated contributions). You browse offers matching your
              declared purpose (model training, evaluation, safety
              benchmark, product research, academic research, government
              audit), purchase against them, and the delivery flow
              signs each data point with the citizen's at-sale-time
              key. The sponsor-side browse + purchase endpoint lands
              in Phase 13.5.1 (next sprint).
            </p>
            <ul className="ml-5 list-disc space-y-1 text-body text-text">
              <li>Price set by the citizen; sponsors compete on purpose fit</li>
              <li>
                Revocable consent — citizen can revoke; future reads
                fail; past purchases retain the at-sale-time signature
              </li>
              <li>DPDP §12 erasure cascade respected end-to-end</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Sponsor experience */}
      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          Sponsor experience
        </h2>
        <ul className="space-y-3 text-body text-text">
          <li>
            <span className="font-semibold">Bearer-token authenticated</span>{' '}
            sponsor console at /sponsor. Token issued by Bharat OS
            operators once you onboard.
          </li>
          <li>
            <span className="font-semibold">Escrow-locked payments</span>:
            you deposit, lock at job/round launch, debit per accepted
            submission. Refundable if you cancel before workers commit.
          </li>
          <li>
            <span className="font-semibold">QC pipeline</span>: golden-
            set checking + minimum worker score gating + sponsor-review
            sampling.
          </li>
          <li>
            <span className="font-semibold">Signed audit exports</span>:
            every job and round comes with a downloadable NDJSON bundle
            carrying the Ed25519 signature of the Bharat OS audit
            signer. Verify provenance independently.
          </li>
        </ul>
      </section>

      {/* Posture for AI labs */}
      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          Posture for AI labs and academic institutions
        </h2>
        <p className="mb-3 text-body text-text">
          Bharat OS doesn't compete with you. We provide the substrate
          where you can source data from real Indian citizens and
          workers, ethically, with the consent + payment + audit-trail
          guarantees built in.
        </p>
        <p className="text-body text-text">
          You declare a sponsor purpose (model_training,
          model_evaluation, safety_benchmark, product_research,
          academic_research, gov_audit); citizens publish offers with
          a purpose allowlist; the marketplace matches the two. If you
          want a specific data shape (Hindi voice transcripts under
          5 seconds, urban-rural balanced span annotation on Indian
          consumer-protection cases, etc.), you create a labeling job
          for it; workers across India fulfil.
        </p>
      </section>

      {/* DPDP + RBI */}
      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          Compliance posture
        </h2>
        <ul className="space-y-3 text-body text-text">
          <li>
            <span className="font-semibold">DPDP Act 2023</span>: §12
            erasure cascade implemented; §11 notice + consent built into
            every sponsor read; §9 grievance contact reachable per
            citizen via the /citizen/dpdp surface.
          </li>
          <li>
            <span className="font-semibold">RBI / NPCI</span>: mesh
            balance settlements composable with UPI rails (planned via
            §4.1 in the API integrations doc); citizen data payouts
            land in fiat-credit equivalent.
          </li>
          <li>
            <span className="font-semibold">Audit signer transparency</span>:
            the Ed25519 public key signing your export bundles is
            published at /api/audit-signer/public-key and surfaced on the
            citizen Settings page. Verify independently.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <Card title="Get sponsor access" subtitle="Operator-onboarded">
          <p className="mb-3 text-body text-text">
            Sponsor accounts are operator-issued. Reach out via the
            About page contact details for onboarding. Demo sponsors
            can explore the sponsor console at /sponsor with a demo
            bearer token.
          </p>
          <Link to="/">
            <Action variant="trust">Try the demo →</Action>
          </Link>
        </Card>
      </section>
    </MarketingLayout>
  );
}
