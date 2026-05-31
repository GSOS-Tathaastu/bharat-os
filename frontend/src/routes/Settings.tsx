import { Action, Card } from '@/components/ui';
import { useIdentityStore } from '@/lib/identity-store';
import { useNavigate } from 'react-router-dom';

export function SettingsPage() {
  const clear = useIdentityStore((s) => s.clear);
  const navigate = useNavigate();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 space-y-4">
      <h1 className="text-display font-semibold">Settings</h1>

      <Card title="Identity">
        <p className="text-body text-text-muted mb-3">
          Persona is stored locally on this device only. Switching personas
          does not affect any server state.
        </p>
        <Action
          variant="secondary"
          onClick={() => {
            clear();
            navigate('/');
          }}
        >
          Forget persona on this device
        </Action>
      </Card>

      <Card title="Your data rights (DPDP §12)" tone="governance">
        <p className="text-body text-text-muted mb-3">
          Download all your data, request erasure, or contact our Data
          Protection Officer.
        </p>
        <div className="flex flex-wrap gap-2">
          <Action variant="secondary">Download my data</Action>
          <Action variant="destructive">Delete my account</Action>
        </div>
      </Card>

      <Card title="Notifications">
        <p className="text-body text-text-muted">
          Push for recovery alerts, cash-out updates, and job alerts. Coming
          back via Labs.
        </p>
      </Card>

      <Card title="Developer">
        <p className="text-body text-text-muted mb-3">
          Open the developer shell for the full set of debugging surfaces.
        </p>
        <Action variant="ghost" onClick={() => (window.location.href = '/shell/')}>
          Open /shell/
        </Action>
      </Card>
    </main>
  );
}
