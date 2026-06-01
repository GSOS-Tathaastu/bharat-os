// Phase 12.1b.4 — SLM-D booking-advisor primitives.
//
// Pure prompt builder + completion parser. Given a pre_authorized
// booking + provider context, returns a one-line recommendation
// the SlmBookingAdvisorChip surfaces to the provider as a
// tap-to-accept suggestion.
//
// §15 bindings:
//
//   • Advisor NEVER auto-accepts / auto-rejects. The chip
//     surfaces the SLM's recommendation; the provider's tap is
//     the only path that mutates booking state.
//   • Pickup precision: the advisor only ever sees the masked
//     bubble1dp (~11 km) pre-accept area, NEVER the 4dp pickup
//     pin. Tested.
//   • No citizen PII in the prompt. Builder strips citizen name
//     / phone / address (none exposed to provider pre-accept
//     anyway). The citizen's note IS included because it's the
//     intentional citizen→provider channel.

export const BOOKING_ADVISOR_PROTOCOL_VERSION = 'bos.phase12.booking-advisor.v0';

export type AdvisorVerdict = 'accept' | 'reject' | 'unsure';

export interface ParsedAdvisorResponse {
  verdict: AdvisorVerdict;
  confidence: number;
  rationale: string | null;
  // Suggested reject reason (≤280 chars). Only populated when
  // verdict === 'reject'.
  suggestedRejectReason: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  'cab-driver': 'cab / auto driver',
  'personal-driver': 'personal driver',
  'household-help': 'cook / maid',
  labourers: 'daily-wage labour',
  kirana: 'kirana shop',
  'skilled-trades': 'skilled trade'
};

export interface BookingAdvisorContext {
  roleKind: string;
  // Amount the citizen has pre-authorized to escrow, in paise.
  quotedAmountPaise: number;
  pricingBasis: string;
  // Optional approximate distance (meters) at booking time;
  // computed during marketplace discovery if available.
  distanceMetersAtBooking: number | null;
  // 1-decimal area bucket the citizen pinned (~11 km square).
  // Never the 4dp pickup pin — that's only visible after accept.
  pickupBubble1dp: string | null;
  // Citizen's optional note (max 280 chars; already sanitised by
  // the booking substrate).
  citizenNote: string | null;
  // Provider's own per-role light-form answers from 12.1b.3 if
  // present. Lets the SLM weigh language match + availability.
  providerRoleAnswers: Record<string, unknown> | null;
}

function rupees(paise: number): string {
  if (!Number.isFinite(paise) || paise <= 0) return '0';
  return Math.round(paise / 100).toLocaleString('en-IN');
}

function distanceLabel(m: number | null): string {
  if (m == null || !Number.isFinite(m) || m < 0) return 'unknown';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function buildBookingAdvisorPrompt(ctx: BookingAdvisorContext): string {
  const role = ROLE_LABEL[ctx.roleKind] || ctx.roleKind;
  const note = ctx.citizenNote && ctx.citizenNote.trim()
    ? ctx.citizenNote.trim().slice(0, 280)
    : '(none)';
  const answersDump = ctx.providerRoleAnswers
    ? Object.entries(ctx.providerRoleAnswers)
        .map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join('\n')
    : '  (none)';
  return [
    'You are a fair, on-device assistant for a Bharat OS provider deciding whether to accept an incoming booking.',
    'Be brief and practical. Provider safety + earnings respect come first.',
    '',
    `Role: ${role}`,
    `Citizen offered: ₹${rupees(ctx.quotedAmountPaise)} (${ctx.pricingBasis})`,
    `Approximate distance: ${distanceLabel(ctx.distanceMetersAtBooking)}`,
    `Citizen area (~11 km bucket): ${ctx.pickupBubble1dp ?? 'unknown'}`,
    `Citizen note: ${note}`,
    'Provider profile answers:',
    answersDump,
    '',
    'Reply in exactly this format and NOTHING else:',
    'VERDICT: <one of: accept, reject, unsure>',
    'CONFIDENCE: <0.00 to 1.00>',
    'RATIONALE: <one short sentence, max 20 words>',
    'IF_REJECT: <one polite reject-reason in plain English, max 240 characters; otherwise leave blank>',
    '',
    'YOUR ANSWER:'
  ].join('\n');
}

const VERDICT_RE = /^\s*VERDICT\s*[:=]\s*(accept|reject|unsure)/im;
const CONFIDENCE_RE = /^\s*CONFIDENCE\s*[:=]\s*([\d.]+)/im;
const RATIONALE_RE = /^\s*RATIONALE\s*[:=]\s*(.+)$/im;
const REJECT_RE = /^\s*IF_REJECT\s*[:=]\s*(.+)$/im;

function clampConfidence(s: string | undefined): number {
  if (!s) return 0.5;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return Math.min(1, n / 100);
  return n;
}

function clipLine(s: string | undefined, max: number): string | null {
  if (!s) return null;
  const trimmed = s.replace(/^["'`\s]+/, '').replace(/["'`\s]+$/, '').split('\n')[0].trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseBookingAdvisorCompletion(text: string): ParsedAdvisorResponse | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const normalised = text.replace(/\r\n/g, '\n');
  const verdictMatch = VERDICT_RE.exec(normalised);
  if (!verdictMatch) return null;
  const verdict = verdictMatch[1].toLowerCase() as AdvisorVerdict;
  const confMatch = CONFIDENCE_RE.exec(normalised);
  const rationaleMatch = RATIONALE_RE.exec(normalised);
  const rejectMatch = REJECT_RE.exec(normalised);
  return {
    verdict,
    confidence: clampConfidence(confMatch?.[1]),
    rationale: clipLine(rationaleMatch?.[1], 280),
    suggestedRejectReason: verdict === 'reject' ? clipLine(rejectMatch?.[1], 240) : null
  };
}

export function verdictLabel(v: AdvisorVerdict): string {
  switch (v) {
    case 'accept':
      return 'Recommends: Accept';
    case 'reject':
      return 'Recommends: Politely reject';
    case 'unsure':
      return 'Not sure — your call';
  }
}
