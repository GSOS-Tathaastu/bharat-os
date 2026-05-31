import { Card } from '@/components/ui';

export function VerifyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6">
      <h1 className="text-display font-semibold">Verifier</h1>
      <Card title="Coming in Phase 11.4">
        <p className="text-body text-text-muted">
          MFI / kirana / hotel scans a worker's signed share URL and reads the
          bundle. Adapted from the existing /verify/ surface.
        </p>
      </Card>
    </main>
  );
}
