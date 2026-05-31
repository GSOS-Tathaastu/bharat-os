// Phase 11.9 — earn-role catalog for the in-flow onboarding chooser.
//
// Two categories of role:
//
//   • Live roles — already implemented surfaces (labeling marketplace,
//     federated rounds + mesh inference). Picking these routes the
//     citizen straight to the persona picker, then to the matching
//     /app/ tab.
//
//   • Coming-soon roles — provider motions (driver, cook, kirana,
//     maid, skilled trades) that depend on the Phase 12.0
//     providerIdentity substrate. Picking these surfaces the
//     "Coming Phase 12" detail sheet so investors / users see the
//     roadmap inline.
//
// This is deliberately data, not embedded JSX in Onboarding.tsx,
// so the same list can drive a future role-picker on the worker
// home (e.g. "Add another way to earn"), the docs, and the
// investor demo without three copies.

export interface EarnRole {
  id: string;
  label: string;
  icon: string;
  description: string;
  /**
   * Path to navigate to when this role's persona picker resolves.
   * Only used for live roles. Coming-soon roles ignore this.
   */
  targetPath?: string;
  /**
   * Phase 12.0 provider roles flip on once the substrate ships.
   * They route through the generic provider-onboarding flow
   * (`/earn/provider-onboarding?role=<id>`) which creates a
   * draft providerIdentity bound to the active root identity.
   * The per-role wizard ships in Phase 12.2.
   */
  providerRoleKind?:
    | 'cab-driver'
    | 'personal-driver'
    | 'labourers'
    | 'household-help'
    | 'kirana'
    | 'skilled-trades';
  /** Coming-soon roles set this with the Phase 12 sub-phase. */
  comingSoonPhase?: '12.0' | '12.1' | '12.2' | '12.3';
  /** Extra prose for the coming-soon detail sheet. */
  comingSoonNote?: string;
}

export const EARN_ROLES: EarnRole[] = [
  // ─── Live ────────────────────────────────────────────────────
  {
    id: 'label-data',
    label: 'Label data',
    icon: '🏷',
    description: 'Earn paise per accepted label. Preference pairs, classification, span, transcription, safety.',
    targetPath: '/labels'
  },
  {
    id: 'federated-mesh',
    label: 'Train AI on-device',
    icon: '🧠',
    description: 'Contribute federated-learning gradients and serve mesh-inference tokens from your phone.',
    targetPath: '/labs'
  },
  // ─── Phase 12.0 — provider substrate LIVE (Phase 12.2 ships
  // the per-role wizard; v1 onboarding is generic across roles).
  // Each routes through `/earn/provider-onboarding?role=<id>`
  // which creates a draft providerIdentity bound to the
  // active root identity.
  {
    id: 'drive-cab',
    label: 'Drive a cab / auto',
    icon: '🛺',
    description: 'List yourself as a driver. Citizens book you directly via Bharat OS marketplace. No commission.',
    targetPath: '/earn/provider-onboarding?role=cab-driver',
    providerRoleKind: 'cab-driver'
  },
  {
    id: 'personal-driver',
    label: 'Personal driver',
    icon: '🚗',
    description: 'Chauffeur for citizens with their own vehicle. Hourly or recurring bookings.',
    targetPath: '/earn/provider-onboarding?role=personal-driver',
    providerRoleKind: 'personal-driver'
  },
  {
    id: 'labourers',
    label: 'Daily-wage labour',
    icon: '🔨',
    description: 'Construction, loading / unloading, factory line, farm work. Per-day or per-week bookings.',
    targetPath: '/earn/provider-onboarding?role=labourers',
    providerRoleKind: 'labourers'
  },
  {
    id: 'household-help',
    label: 'Maid / cook (household help)',
    icon: '🍲',
    description: 'Maid, cook, cleaner — list yourself for recurring household services. Police verification + references.',
    targetPath: '/earn/provider-onboarding?role=household-help',
    providerRoleKind: 'household-help'
  },
  // ─── Phase 12.3+ — wave 2 still coming-soon ─────────────────────
  {
    id: 'kirana',
    label: 'Run a kirana / shop',
    icon: '🏪',
    description: 'List your shop on the Bharat OS marketplace. Take orders + payment direct, no commission.',
    comingSoonPhase: '12.3',
    comingSoonNote:
      'Register your shop, upload your inventory (or just product categories), accept orders from nearby citizens. No commission, no aggregator markup.'
  },
  {
    id: 'skilled-trades',
    label: 'Skilled work',
    icon: '🔧',
    description: 'Electrician, plumber, carpenter, painter, AC technician — citizens book you direct.',
    comingSoonPhase: '12.3',
    comingSoonNote:
      'Register your trade, attach proof of training (ITI certificate, prior employer letter, references), set your rates. Trust Passport grows with every completed job rated by citizens.'
  }
];

export function isComingSoonRole(role: EarnRole): boolean {
  return role.comingSoonPhase != null;
}
