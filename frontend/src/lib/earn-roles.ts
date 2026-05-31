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
  /** Coming-soon roles set this with the Phase 12 sub-phase. */
  comingSoonPhase?: '12.0' | '12.1' | '12.2';
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
  // ─── Coming Phase 12.0 — provider substrate ───────────────────
  {
    id: 'drive-cab',
    label: 'Drive a cab / auto / scooter',
    icon: '🛺',
    description: 'List yourself as a driver. Citizens book you directly via Bharat OS marketplace.',
    comingSoonPhase: '12.0',
    comingSoonNote:
      'Set up your verified profile, list your vehicle and service area, and start receiving bookings directly. Bharat OS does not take a cut of your fare — citizens pay you over UPI.'
  },
  {
    id: 'cook',
    label: 'Cook',
    icon: '🍲',
    description: 'List home-cooked meals, tiffin services, or event catering. Citizens book direct.',
    comingSoonPhase: '12.0',
    comingSoonNote:
      'List the cuisines you cook, your area, and your weekly schedule. Citizens browse, book, and pay you directly via UPI.'
  },
  {
    id: 'kirana',
    label: 'Run a kirana / shop',
    icon: '🏪',
    description: 'List your shop on the Bharat OS marketplace. Take orders + payment direct, no commission.',
    comingSoonPhase: '12.0',
    comingSoonNote:
      'Register your shop, upload your inventory (or just product categories), accept orders from nearby citizens. No commission, no aggregator markup.'
  },
  {
    id: 'home-help',
    label: 'Help around the house',
    icon: '🧹',
    description: 'Maid, cleaner, gardener, washing — list yourself for household services.',
    comingSoonPhase: '12.0',
    comingSoonNote:
      'List the household services you offer, your area, and your weekly availability. Verified by Bharat OS Trust Passport over time.'
  },
  {
    id: 'skilled-trades',
    label: 'Skilled work',
    icon: '🔧',
    description: 'Electrician, plumber, carpenter, painter, AC technician — citizens book you direct.',
    comingSoonPhase: '12.0',
    comingSoonNote:
      'Register your trade, attach proof of training (ITI certificate, prior employer letter, references), set your rates. Trust Passport grows with every completed job rated by citizens.'
  }
];

export function isComingSoonRole(role: EarnRole): boolean {
  return role.comingSoonPhase != null;
}
