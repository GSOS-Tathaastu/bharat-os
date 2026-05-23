# ADR 0045: §9B Native Service Marketplace (Bharat OS Owns the Substrate)

## Status

Accepted

## Context

§9A described the labor flow as one instance of a larger pattern: voice
intent → match → negotiate → escrow → execute → audit. That pattern covers
cab booking, hotel booking, train / flight / bus tickets, food, groceries,
contractor / electrician / doctor / tutor matching, and every other case
where Bharat OS is the user's agent against a third-party service.

The first version of this ADR (since superseded inline) framed the strategy as
"ride ONDC." Re-examined: Bharat OS is an **OS**, not a buyer app. An OS that
sits *under* a protocol designed for any-buyer-any-seller is a voice front-end
above someone else's marketplace, with its evolution governed by a committee
Bharat OS does not control. That is incompatible with the §0 / §6 / §15
posture — Bharat OS owns its substrate.

§9B in `BHARAT_OS.md` makes this principle explicit: the L6 service
marketplace is Bharat OS's substrate, not ONDC's. ONDC is a useful Phase A
bridge while native supply bootstraps, and Bharat OS exposes Beckn-compatible
endpoints for interop, but Bharat OS never *depends* on ONDC.

## Decision

Introduce a native L6 service marketplace as the primary substrate for the
new `service_booking` action type. Demote ONDC integration to an internal
bridge adapter used only during Phase A density bootstrap.

### Tool layer (L3 / L6)

- `bharat_marketplace` (L6) — Bharat OS native service marketplace. Returns a
  normalized booking receipt. Internally may call the ONDC bridge for
  density, but matching, ranking, settlement, and audit happen in Bharat OS.
  Caller can opt out of the bridge via `metadata.includeOndcBridge=false`.
- `ondc_beckn` (L3) — ONDC / Beckn outbound bridge. Phase A only. Receipt
  marks `source: 'ondc'`. Available as a directly-callable tool for
  Phase A scenarios but not the substrate.

### Skill layer (L6)

- `bos:skill:bharat-marketplace` — primary skill for `service_booking`,
  bound to `bharat_marketplace`.
- `bos:skill:ondc-bridge` — secondary skill, bound to `ondc_beckn`, labelled
  as Phase A only.

### Policy layer (L4)

- `ACTION_TEMPLATES.service_booking` defaults `defaultTool` to
  `bharat_marketplace`. Existing §9A worker-protection policies
  (`policy.worker.no_advance_fee`, `policy.money.fiat_settlement_only`,
  `policy.money.limit_required`) already generalize to service bookings
  because they are not labor-specific in the engine.

### Orchestrator (L7)

- `ORCHESTRATION_TEMPLATES.service_booking` defaults `tool` to
  `bharat_marketplace` and plans through `marketplace_search_native` →
  `marketplace_search_ondc_bridge` → `rank_by_trust_passport` →
  `present_choice` → `confirm_booking` → `write_receipt`.

### Vernacular (L8)

- Service-booking intent aliases added for Hindi, Marathi, Bhojpuri, Tamil,
  and Bengali, covering cab / taxi / hotel / ticket / food / grocery in both
  script and romanized forms.
- `VERNACULAR_RESPONSES.service_booking` adds `planned` / `blocked` /
  `completed` phrases in all six locales (en + five Indian languages).

### Service verticals

`SERVICE_VERTICALS = ['cab', 'hotel', 'ticket', 'food', 'grocery', 'services']`
is exported from `tools.mjs`. New verticals are additive — the policy engine
and Trust Passport do not need changes.

## Consequences

- A voice intent like *"mujhe ek cab book karo"* now routes through the
  Bharat OS-native L6 marketplace, with the ONDC bridge included as a
  fallback discovery source.
- The native provider wins by default because it carries 0% commission and is
  ranked on Trust Passport — encoding the §9B principle that the substrate
  prefers itself.
- The §9A worker protections automatically apply to service bookings where
  the relevant fields are set (no advance fee, fiat settlement, escrow as
  applicable). New verticals inherit them.
- Bharat OS now has a clean line between its substrate (`bharat_marketplace`,
  L6) and its bridge to public-good networks (`ondc_beckn`, L3). This is the
  same posture the doc takes toward MOSIP / UPI in §13C — adopt the open
  protocol, own the OS-level integration.
- The bridge is a Phase A crutch, not a strategy. §9B explicitly flags that
  if the bridge becomes load-bearing, Bharat OS has quietly slipped into the
  "buyer app" position the doc rejects. Native supply growth is the work
  this ADR points toward but does not itself land.
