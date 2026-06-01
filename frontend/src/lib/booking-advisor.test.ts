import { describe, expect, it } from 'vitest';
import {
  buildBookingAdvisorPrompt,
  parseBookingAdvisorCompletion,
  verdictLabel,
  type BookingAdvisorContext
} from './booking-advisor';

const baseContext: BookingAdvisorContext = {
  roleKind: 'cab-driver',
  quotedAmountPaise: 50000,
  pricingBasis: 'per-service',
  distanceMetersAtBooking: 3200,
  pickupBubble1dp: '18.5,73.9',
  citizenNote: 'Pickup at PMC main gate at 8 am.',
  providerRoleAnswers: { languages: ['hi', 'mr'], vehicleType: 'taxi-sedan' }
};

describe('buildBookingAdvisorPrompt', () => {
  it('embeds role label + quoted amount + bubble + note', () => {
    const p = buildBookingAdvisorPrompt(baseContext);
    expect(p).toMatch(/Role:\s*cab \/ auto driver/);
    expect(p).toMatch(/Citizen offered: ₹500/);
    expect(p).toMatch(/Approximate distance:\s*3\.2 km/);
    expect(p).toMatch(/Citizen area.*18\.5,73\.9/);
    expect(p).toMatch(/PMC main gate/);
  });
  it('formats output schema verbatim', () => {
    const p = buildBookingAdvisorPrompt(baseContext);
    expect(p).toMatch(/VERDICT:/);
    expect(p).toMatch(/CONFIDENCE:/);
    expect(p).toMatch(/RATIONALE:/);
    expect(p).toMatch(/IF_REJECT:/);
  });
  it('does NOT include any 4dp coordinate in the prompt (pre-accept binding)', () => {
    const p = buildBookingAdvisorPrompt(baseContext);
    expect(p).not.toMatch(/[0-9]+\.[0-9]{4,}/);
  });
  it('handles missing note + distance gracefully', () => {
    const p = buildBookingAdvisorPrompt({ ...baseContext, citizenNote: null, distanceMetersAtBooking: null });
    expect(p).toMatch(/Citizen note: \(none\)/);
    expect(p).toMatch(/Approximate distance: unknown/);
  });
});

describe('parseBookingAdvisorCompletion', () => {
  it('parses a well-formed accept reply', () => {
    const c = `VERDICT: accept
CONFIDENCE: 0.85
RATIONALE: Matches your usual area and the rate is fair.`;
    const r = parseBookingAdvisorCompletion(c)!;
    expect(r.verdict).toBe('accept');
    expect(r.confidence).toBeCloseTo(0.85, 2);
    expect(r.rationale).toMatch(/usual area/);
    expect(r.suggestedRejectReason).toBeNull();
  });
  it('parses a reject reply + extracts the polite reason', () => {
    const c = `VERDICT: reject
CONFIDENCE: 0.7
RATIONALE: Outside your stated service area.
IF_REJECT: Sorry, this trip is outside my usual area today.`;
    const r = parseBookingAdvisorCompletion(c)!;
    expect(r.verdict).toBe('reject');
    expect(r.suggestedRejectReason).toMatch(/outside my usual area/i);
  });
  it('parses unsure + drops IF_REJECT', () => {
    const c = `VERDICT: unsure
CONFIDENCE: 0.45
RATIONALE: Not enough info on this one.
IF_REJECT: Whatever was here should be dropped.`;
    const r = parseBookingAdvisorCompletion(c)!;
    expect(r.verdict).toBe('unsure');
    expect(r.suggestedRejectReason).toBeNull();
  });
  it('returns null when VERDICT is missing or invalid', () => {
    expect(parseBookingAdvisorCompletion('I cannot decide.')).toBeNull();
    expect(parseBookingAdvisorCompletion('VERDICT: maybe\nCONFIDENCE: 0.5')).toBeNull();
  });
  it('clamps out-of-range confidence', () => {
    const high = `VERDICT: accept
CONFIDENCE: 88`;
    const low = `VERDICT: accept
CONFIDENCE: -1`;
    expect(parseBookingAdvisorCompletion(high)!.confidence).toBeLessThanOrEqual(1);
    expect(parseBookingAdvisorCompletion(low)!.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('verdictLabel', () => {
  it('returns a human-friendly label for every verdict', () => {
    expect(verdictLabel('accept')).toMatch(/Accept/);
    expect(verdictLabel('reject')).toMatch(/Politely reject/);
    expect(verdictLabel('unsure')).toMatch(/Not sure/);
  });
});
