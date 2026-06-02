// Phase 13.6 — AboutPage
//
// "What is Bharat OS?" — vision, founder thesis, who it's for,
// what makes it different. Public route. No identity gate.

import { Link } from 'react-router-dom';
import { Card, Action } from '@/components/ui';
import { MarketingLayout } from '@/components/MarketingLayout';

export function AboutPage() {
  return (
    <MarketingLayout>
      <section className="mb-12">
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">
          About
        </p>
        <h1 className="text-display font-semibold text-text">
          India's first AI-native OS where YOU own your data.
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-text-muted">
          Bharat OS is an operating system built for India — on-device by
          default, citizen-owned by construction, and economically aligned
          so every participant (citizen, worker, provider) earns from
          their contribution.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          Why Bharat OS exists
        </h2>
        <p className="mb-3 text-body text-text">
          Every major mobile and AI platform today is built somewhere else,
          for someone else. Apple ships an OS designed in California for
          ~⅓ of the global high-end smartphone market. Google's Android
          serves the world but extracts value back to advertising. OpenAI,
          Anthropic, Google, and Meta train their models on user data
          implicitly — taking the value without paying.
        </p>
        <p className="mb-3 text-body text-text">
          India has 700 million smartphone users and another ~700 million
          who don't have a usable smartphone yet. The way AI is being
          rolled out across the world doesn't serve either group well —
          it sends their data to foreign clouds, charges them in foreign
          currency, and gives them nothing in return.
        </p>
        <p className="text-body text-text">
          Bharat OS inverts the model. The intelligence runs on the
          citizen's own device. The data stays on the citizen's own
          device. When a sponsor wants to use a citizen's data — for
          model training, evaluation, safety benchmarks, or research —
          the citizen says yes, names the price, and gets paid.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-heading font-semibold text-text">
          The three pillars
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="On-device" subtitle="Inference + storage + audit">
            <p className="text-body text-text">
              Every Small Language Model run, every document summary,
              every PII redaction, every personalisation choice happens
              inside the citizen's browser via WebAssembly. Open DevTools
              → Network: nothing crosses the wire while the model is
              thinking.
            </p>
          </Card>
          <Card title="Citizen-owned" subtitle="Signed consent + revocable">
            <p className="text-body text-text">
              Every piece of citizen data is gated by a per-scope
              consent signed by the citizen's own key. Sponsors can only
              read what was explicitly granted. DPDP §12 cascade is
              honored — the citizen can erase everything in one tap.
            </p>
          </Card>
          <Card title="Economically aligned" subtitle="Earn / Use / Provide">
            <p className="text-body text-text">
              Citizens earn from their data; workers earn from labeling
              + federated training + compute serving; providers earn
              from a native marketplace. Bharat OS earns from the
              transaction fee, not from the data.
            </p>
          </Card>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          What it is, concretely
        </h2>
        <ul className="space-y-3 text-body text-text">
          <li>
            <span className="font-semibold">A mobile app first,</span> then
            an AOSP shell on partner OEMs, then a full Linux-based OS for
            the next billion devices. The same substrate ships through
            every layer.
          </li>
          <li>
            <span className="font-semibold">On-device SLMs</span> (Phi-3-mini
            / Gemma-2B / Qwen2-1.5B class) running via{' '}
            <code className="rounded-sm bg-surface px-1 text-caption">wllama</code>{' '}
            in WebAssembly. Citizens install the model once; everything
            after is offline.
          </li>
          <li>
            <span className="font-semibold">A marketplace for citizen data:</span>{' '}
            citizens publish per-data-point sale offers (intent prompts,
            document summaries, PII-redacted text, skill runs, federated
            contributions) with their own price, sale cap, and sponsor
            purpose allowlist.
          </li>
          <li>
            <span className="font-semibold">A native service marketplace:</span>{' '}
            book a cab, find a maid, hire a contractor — all through
            Bharat OS-onboarded providers, not Ola/Uber re-skins.
          </li>
          <li>
            <span className="font-semibold">A Sahayak-first onboarding</span>{' '}
            for the ~700M Indians without a usable smartphone yet — a
            trained, KYC'd local agent uses THEIR device to bring the
            citizen onto Bharat OS.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          What it is not
        </h2>
        <ul className="space-y-2 text-body text-text">
          <li>
            <span className="font-semibold">Not</span> a cloud-AI wrapper
            with a different brand. The inference runs on YOUR phone.
          </li>
          <li>
            <span className="font-semibold">Not</span> a chatbot. Bharat
            OS is a substrate; chat is one skill among many.
          </li>
          <li>
            <span className="font-semibold">Not</span> a re-skin of an
            existing OS. The substrate ships first; the OS shell ships
            later.
          </li>
          <li>
            <span className="font-semibold">Not</span> ad-supported. The
            revenue lines are transaction fees on a real exchange of
            value.
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <Card
          title="Try the substrate now"
          subtitle="The substrate is live as a demo on the existing FE"
        >
          <p className="mb-3 text-body text-text">
            The Phase 9.0c wllama runtime, Phase 13.0 document summariser,
            Phase 13.1/13.2 PII redactor, Phase 13.3 personalization, and
            Phase 13.4.x SLM-H skill agents (electricity bill explainer,
            consumer complaint drafter, PM-KISAN status checker) are all
            live on /labs. Phase 13.5 citizen data offers ship today.
          </p>
          <Link to="/">
            <Action variant="trust">Try the demo →</Action>
          </Link>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-heading font-semibold text-text">
          Where we are in the build
        </h2>
        <p className="text-body text-text">
          Bharat OS is an investor-pitch MVP under active development. The
          full SLM USP arc (document summarisation, PII redaction, on-device
          personalization, skill agents) is complete; the new revenue line
          (citizen data offers) just opened with Phase 13.5; the Sahayak
          provider role lands in Phase 14.x. See{' '}
          <Link to="/how-it-works" className="text-primary hover:underline">
            How it works
          </Link>{' '}
          for the technical substrate, or jump to{' '}
          <Link to="/for-citizens" className="text-primary hover:underline">
            For citizens
          </Link>{' '}
          /{' '}
          <Link to="/for-sponsors" className="text-primary hover:underline">
            For sponsors
          </Link>{' '}
          for the per-persona pitch.
        </p>
      </section>
    </MarketingLayout>
  );
}
