// Phase 13.6 — HowItWorksPage
//
// The technical substrate explainer. Aimed at investors who want
// to understand the architecture, engineers who want to understand
// the privacy claims, and partners who want to understand the
// composability surface.

import { Link } from 'react-router-dom';
import { Card, Action, Badge } from '@/components/ui';
import { MarketingLayout } from '@/components/MarketingLayout';

export function HowItWorksPage() {
  return (
    <MarketingLayout>
      <section className="mb-12">
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">
          How it works
        </p>
        <h1 className="text-display font-semibold text-text">
          On-device by default. Citizen-owned by construction.
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-text-muted">
          Bharat OS is a stack of composable substrates, each designed
          around one privacy invariant. The whole thing runs on a
          citizen's own device.
        </p>
      </section>

      {/* The 6-layer substrate */}
      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          The six substrates
        </h2>
        <div className="space-y-4">
          <Card
            title="1. On-device SLM runtime"
            subtitle="Phase 9.0c"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="text-body text-text">
              Citizens install a Small Language Model (Phi-3-mini /
              Gemma-2B / Qwen2-1.5B class, ~2.3 GB on disk, ~2.8 GB RAM
              while running) into their browser's OPFS once. Every
              subsequent inference goes through the shared{' '}
              <code className="rounded-sm bg-surface px-1 text-caption">
                wllama
              </code>{' '}
              WebAssembly runtime — no network calls, no remote API.
              Open DevTools → Network and try it: the panel stays empty
              while the model thinks.
            </p>
          </Card>
          <Card
            title="2. Document summariser, PII redactor, personalisation"
            subtitle="Phase 13.0 / 13.1 / 13.2 / 13.3"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="text-body text-text">
              Three on-device skills compose on top of the runtime: a
              document summariser for Indian paperwork (electricity bills,
              Form 16, T&Cs, insurance, lender contracts); a PII redactor
              that catches 11 Indian PII classes (PAN, Aadhaar, mobile,
              GSTIN, account, DL, RC, ABHA, UPI, email, PIN) by regex +
              SLM second pass; and an on-device personalisation profile
              (preferences never leave the device — there is literally no
              BE endpoint for it).
            </p>
          </Card>
          <Card
            title="3. Skill agents for Indian paperwork tasks"
            subtitle="Phase 13.4 / 13.4.1 / 13.4.2 / 13.4.3"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="text-body text-text">
              Tightly-scoped on-device agents that compose the substrates
              above: an electricity bill explainer, a Consumer Protection
              Act 2019 complaint drafter, a PM-KISAN status checker. Each
              skill emits structured next-step verbs from a fixed
              allowlist — the SLM can never inject an arbitrary URL.
              Verbs render as clickable links to official Government of
              India portals (consumerhelpline.gov.in, e-Daakhil,
              pmkisan.gov.in, findmycsc) or tel: links to the official
              helplines (1915, 155261).
            </p>
          </Card>
          <Card
            title="4. Citizen data marketplace"
            subtitle="Phase 13.5"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="text-body text-text">
              Citizens publish per-data-point sale offers: "I am willing
              to sell my [intent prompts / document summaries / PII-redacted
              text / skill runs / federated contributions] for ₹X per sale,
              up to N sales, for purposes [model training / safety benchmark
              / academic research / ...]". Strict allowlist on every field;
              content-derived offerId prevents spam; ms-stripped timestamps
              defeat typing-speed fingerprinting; DPDP §12 cascade wipes
              offers on identity erase.
            </p>
          </Card>
          <Card
            title="5. Worker marketplace (labeling + federated + mesh)"
            subtitle="Phase 10 / Phase 3.x"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="text-body text-text">
              Workers earn by labeling sponsors' data, contributing to
              federated learning rounds, or (future) serving on-device
              compute to other citizens. Sponsor escrow locks payment
              at job launch; QC pipeline routes a sample to sponsors
              for human review; signed audit-export bundles let sponsors
              prove provenance of every labeled item.
            </p>
          </Card>
          <Card
            title="6. Provider marketplace (Bharat-OS-native services)"
            subtitle="Phase 12.1 / 12.2 / 12.3"
            actions={<Badge variant="trust">Shipped</Badge>}
          >
            <p className="text-body text-text">
              Book a cab, find a maid, hire a contractor, order from a
              kirana, find skilled trades — all through Bharat OS-onboarded
              providers, with KYC L1, role-extras (e-Shram registrations,
              scheme entitlements), DigiLocker / GST / Parivahan
              integrations, and a thin marketplace layer. Not an Ola/Uber
              re-skin: the providers are Bharat OS native.
            </p>
          </Card>
        </div>
      </section>

      {/* Privacy invariants */}
      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          The privacy invariants (§15 bindings)
        </h2>
        <div className="space-y-3">
          <div className="rounded-md border border-trust-100 bg-trust-50 p-3">
            <p className="font-semibold text-text">
              Pointer-not-payload audit ledger
            </p>
            <p className="mt-1 text-body text-text">
              Every audit-ledger event carries POINTERS (recordId, offerId,
              skillId) + COUNT-only meta (number of bullets, length of
              titles, number of bytes) — never the actual content. A
              `FORBIDDEN_LEDGER_SUBSTRINGS` probe asserts at test time
              that no body byte ever leaks.
            </p>
          </div>
          <div className="rounded-md border border-trust-100 bg-trust-50 p-3">
            <p className="font-semibold text-text">
              Strict allowlist &gt; denylist
            </p>
            <p className="mt-1 text-body text-text">
              Every boundary normaliser uses an explicit allowlist on
              top-level envelope keys. A typo (`descritpion`) or a
              future leak vector (`promptBody`) hard-rejects at the
              validator — there is no "let unknown fields through".
            </p>
          </div>
          <div className="rounded-md border border-trust-100 bg-trust-50 p-3">
            <p className="font-semibold text-text">
              DPDP §12 cascade on identity erase
            </p>
            <p className="mt-1 text-body text-text">
              When a citizen requests deletion, every per-identity table
              is swept by ownerId / publisherId / workerId / etc. The
              cascade is atomic (single SQLite transaction in the SQLite
              backend). Audit-ledger entries that mention the erased
              identity are redacted in-place; the seq number stays for
              integrity but the personally-identifying fields go to NULL.
            </p>
          </div>
          <div className="rounded-md border border-trust-100 bg-trust-50 p-3">
            <p className="font-semibold text-text">
              Signed-consent for every cross-boundary read
            </p>
            <p className="mt-1 text-body text-text">
              Sponsors can never read a citizen's data without an active
              consent artifact signed by the citizen's own key. Bharat
              OS server CANNOT fabricate the consent — the signing-fields
              contract is regression-pinned in vitest.
            </p>
          </div>
          <div className="rounded-md border border-trust-100 bg-trust-50 p-3">
            <p className="font-semibold text-text">
              Allowlisted external launchers
            </p>
            <p className="mt-1 text-body text-text">
              Skill-agent action verbs render as clickable links via a
              4-link defence-in-depth chain: parser only accepts
              allowlist verbs → each verb maps to a fixed launcher via
              an exhaustive Record type → a module-load guard asserts
              every URL matches the 4-entry .gov.in / .nic.in
              allowlist → renderer reads from the map, never from SLM
              output. The SLM cannot inject a clickable URL.
            </p>
          </div>
        </div>
      </section>

      {/* Distribution */}
      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          Distribution path: app first, OS later
        </h2>
        <p className="mb-3 text-body text-text">
          The substrate ships through three layers in sequence:
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card
            title="2a. App"
            subtitle="PWA + Trusted Web Activity"
            actions={<Badge variant="warning">Planned</Badge>}
          >
            <p className="text-body text-text">
              The fastest distribution path. The existing FE is the app;
              the operator console wraps as a Progressive Web App;
              Android users install via TWA. ~1 week of work with a
              hosted backend.
            </p>
          </Card>
          <Card
            title="2b. AOSP shell"
            subtitle="OEM partnership"
            actions={<Badge variant="warning">Planned</Badge>}
          >
            <p className="text-body text-text">
              The substrate inside an Android Open Source Project shell
              on partner OEM hardware. Citizens get a Bharat OS
              experience without losing Android app compatibility.
              6-12 months with OEM cooperation.
            </p>
          </Card>
          <Card
            title="2c. Full ROM"
            subtitle="Linux-based OS"
            actions={<Badge variant="warning">Planned</Badge>}
          >
            <p className="text-body text-text">
              A full Linux-based OS for the next billion devices. The
              substrate stays the same; the shell becomes native.
              Multi-year horizon, dependent on partner + capital.
            </p>
          </Card>
        </div>
      </section>

      {/* Try */}
      <section className="mb-12">
        <Card
          title="The substrate is live now"
          subtitle="Investor-pitch MVP under active development"
        >
          <p className="mb-3 text-body text-text">
            Sign up → install a Small Language Model → try the
            document summariser, PII redactor, skill agents (electricity
            bill, consumer complaint, PM-KISAN), and the citizen data
            marketplace. The whole thing runs in your browser.
          </p>
          <Link to="/">
            <Action variant="trust">Try the substrate →</Action>
          </Link>
        </Card>
      </section>
    </MarketingLayout>
  );
}
