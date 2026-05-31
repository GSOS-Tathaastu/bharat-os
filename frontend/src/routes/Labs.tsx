import { Card } from '@/components/ui';

export function LabsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <h1 className="text-display font-semibold">Labs</h1>
      <p className="text-body text-text-muted">
        Advanced features that are not yet on the primary surfaces.
      </p>
      <Card title="On-device language model (Phase 9.0c — pending)">
        <p className="text-body text-text-muted">
          The SLM registry (9.0a) and install flow (9.0b) are live. The runtime
          that actually executes inference lands in Phase 9.0c.
        </p>
      </Card>
      <Card title="Federated training rounds">
        <p className="text-body text-text-muted">
          Earn paise per round by helping train Bharat OS's models. Privacy-
          preserving DP-SGD, gradient never leaves your phone unencrypted.
        </p>
      </Card>
      <Card title="OCR + health records">
        <p className="text-body text-text-muted">
          Camera capture → on-device OCR → ABHA structured upload. Original
          stays encrypted on your phone.
        </p>
      </Card>
    </main>
  );
}
