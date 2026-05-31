import { cn } from '@/lib/cn';

interface MoneyProps {
  paise: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showSign?: boolean;
}

const sizeStyles = {
  sm: 'text-body',
  md: 'text-heading',
  lg: 'text-display',
  xl: 'text-hero'
} as const;

// Format paise as rupees with Indian-numbering grouping (₹1,00,000 instead of ₹100,000).
export function Money({ paise, size = 'md', className, showSign = false }: MoneyProps) {
  const rupees = paise / 100;
  const formatted = rupees.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const display = showSign && rupees > 0 ? `+${formatted}` : formatted;
  return (
    <span className={cn('font-semibold tabular-nums text-text', sizeStyles[size], className)}>
      {display}
    </span>
  );
}
