import { useNavigate } from 'react-router-dom';
import { Action, Card } from '@/components/ui';
import { useProviderContextStore } from '@/lib/provider-context-store';
import type { ProviderIdentity } from '@/lib/hooks';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProviderSettings(_props: { provider: ProviderIdentity }) {
  const navigate = useNavigate();
  const clearContext = useProviderContextStore((s) => s.clearActiveProvider);
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-3">
      <header>
        <h1 className="text-display font-semibold">Settings</h1>
      </header>

      <Card title="Push notifications">
        <p className="text-body text-text-muted">
          Enabled on /settings (citizen-wide). Bharat OS pushes new
          bookings, citizen confirmations, and auto-release payouts.
        </p>
        <div className="mt-2">
          <Action variant="ghost" onClick={() => navigate('/settings')}>
            Manage push
          </Action>
        </div>
      </Card>

      <Card title="Sign out of provider mode">
        <p className="text-body text-text-muted">
          Clears the active-provider context. You stay signed into
          Bharat OS as a citizen.
        </p>
        <div className="mt-2">
          <Action variant="ghost" onClick={() => { clearContext(); navigate('/'); }}>
            Sign out of provider mode
          </Action>
        </div>
      </Card>
    </main>
  );
}
