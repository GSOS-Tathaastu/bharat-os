import { Link } from 'react-router-dom';
import { Action, Card, Money } from '@/components/ui';

interface EscrowInsufficientCalloutProps {
  requiredPaise: number;
  availablePaise: number;
}

export function EscrowInsufficientCallout({
  requiredPaise,
  availablePaise
}: EscrowInsufficientCalloutProps) {
  const shortfall = Math.max(0, requiredPaise - availablePaise);
  return (
    <Card tone="warning" title="Insufficient escrow">
      <p className="text-body">
        This action needs <Money paise={requiredPaise} size="sm" /> locked. Your
        available escrow is <Money paise={availablePaise} size="sm" />, which is
        short by <Money paise={shortfall} size="sm" />.
      </p>
      <p className="mt-2 text-caption text-text-muted">
        Sponsor escrow is topped up by your Bharat OS admin (off-system fiat
        wire / NEFT). Reach out to your onboarder; once they deposit, you can
        retry this action.
      </p>
      <div className="mt-3 flex gap-2">
        <Link to="/sponsor/escrow">
          <Action size="sm" variant="secondary">
            View escrow
          </Action>
        </Link>
      </div>
    </Card>
  );
}
