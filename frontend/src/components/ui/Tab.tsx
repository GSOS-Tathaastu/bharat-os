import { NavLink } from 'react-router-dom';
import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TabItem {
  to: string;
  label: ReactNode;
  icon?: ReactNode;
  end?: boolean;
}

interface TabsProps {
  items: TabItem[];
  className?: string;
}

// Bottom-nav on mobile, top-tab on desktop. Auto-switches by viewport.
export function Tabs({ items, className }: TabsProps) {
  return (
    <nav
      className={cn(
        // Mobile: fixed bottom bar
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white',
        // Desktop: inline, top-aligned
        'sm:static sm:border-t-0 sm:border-b sm:bg-transparent',
        className
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-3xl items-stretch',
          'sm:gap-2 sm:px-4'
        )}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-caption font-semibold text-text-muted transition-colors',
                'sm:flex-none sm:flex-row sm:py-2 sm:text-body',
                isActive && 'text-primary border-t-2 border-primary sm:border-t-0 sm:border-b-2'
              )
            }
          >
            {item.icon && <span aria-hidden>{item.icon}</span>}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
