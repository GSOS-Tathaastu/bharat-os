import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/sponsor/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/sponsor/jobs', label: 'Jobs', icon: '🏷' },
  { to: '/sponsor/rounds', label: 'Rounds', icon: '🔁' },
  // Phase 13.5.1 — citizen data marketplace
  { to: '/sponsor/data-offers', label: 'Data', icon: '🛒' },
  { to: '/sponsor/escrow', label: 'Escrow', icon: '💰' },
  { to: '/sponsor/settings', label: 'Settings', icon: '⚙' }
];

export function SponsorBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-white sm:static sm:border-0">
      <ul className="mx-auto flex max-w-5xl">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'flex h-14 flex-col items-center justify-center gap-1 text-caption transition-colors',
                  isActive ? 'text-primary font-semibold' : 'text-text-muted hover:text-text'
                )
              }
            >
              <span aria-hidden className="text-base">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
