// Phase 13.4.3 — SkillActionLink
//
// Shared renderer for SLM-H skill action items. Each
// SkillActionVerb maps to a SkillActionLauncher via the
// ACTION_LAUNCHER map in skill-agent.ts. This component peels
// open that launcher and renders one of four branches:
//
//   - 'url'    → external <a href> with rel="noopener noreferrer"
//                target="_blank" (security defaults for external
//                navigation; required because the citizen's
//                Bharat OS session must not be exposed to the
//                external page via window.opener)
//   - 'tel'    → <a href="tel:NUMBER"> — mobile dials, desktop
//                often shows a prompt
//   - 'in_app' → <Link to="..."> via react-router for in-app
//                routing (kept tab-internal)
//   - 'none'   → plain text — informational only, no actionable
//                link. Honest framing for verbs that have no
//                universal launcher (state-specific portals,
//                bank-specific paths).
//
// §15 bindings:
//   • URL allowlist (ALLOWED_LAUNCHER_URL_PREFIXES) — the SLM
//     cannot inject a clickable URL. Every renderable URL is
//     compile-time fixed in ACTION_LAUNCHER + asserted at
//     module load.
//   • External-link safety — every <a target="_blank"> carries
//     rel="noopener noreferrer". A future PR that adds an
//     external link via this component MUST go through this
//     same wrapper.

import { Link } from 'react-router-dom';
import {
  ACTION_LABEL,
  ACTION_LAUNCHER,
  type SkillActionVerb
} from '@/lib/skill-agent';

interface SkillActionLinkProps {
  verb: SkillActionVerb;
}

export function SkillActionLink({ verb }: SkillActionLinkProps) {
  const launcher = ACTION_LAUNCHER[verb];
  const label = ACTION_LABEL[verb];

  switch (launcher.kind) {
    case 'url':
      return (
        <a
          href={launcher.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary-700"
        >
          {label}
        </a>
      );
    case 'tel':
      return (
        <a
          href={`tel:${launcher.number}`}
          className="text-primary underline hover:text-primary-700"
        >
          {label}{' '}
          <span className="text-caption text-text-muted">
            (tap to dial {launcher.number})
          </span>
        </a>
      );
    case 'in_app':
      return (
        <Link
          to={launcher.route}
          className="text-primary underline hover:text-primary-700"
        >
          {label}
        </Link>
      );
    case 'none':
    default:
      return <span>{label}</span>;
  }
}
