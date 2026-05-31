import { Tabs } from '@/components/ui';
import type { ProviderIdentity } from '@/lib/hooks';

const TABS = [
  { to: '/provider/inbox', label: 'Inbox', icon: '📥' },
  { to: '/provider/active', label: 'Active', icon: '🟢' },
  { to: '/provider/history', label: 'History', icon: '📜' },
  { to: '/provider/profile', label: 'Profile', icon: '👤' },
  { to: '/provider/settings', label: 'Settings', icon: '⚙' }
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProviderBottomNav(_props: { provider: ProviderIdentity }) {
  return <Tabs items={TABS} />;
}
