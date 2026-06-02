# API Integrations — what Bharat OS needs to go live

This is the living tracking doc for every external API the
Bharat OS substrate composes. The goal is a single page you can
read before a deploy / investor pitch and know exactly:

- which services are running on **stub fixtures** today
- which need a **sandbox key** to flip to live
- which need a **commercial agreement / partner credentials**
- which are still **unbuilt** but on the roadmap

Every adapter composes the Phase 12.2.1 external-adapter
substrate (`src/phase0/external-adapter.mjs`) so the shape is
identical across all of them: env-configurable mode (stub|live),
audit-ledger emission (meta only, NEVER bytes), polite
User-Agent + rate-limit + cache.

Last updated: 2026-06-02 (Phase 13.4 — SLM-H on-device skill-agent
substrate + first concrete skill (electricity bill explainer)
shipped. **Still zero new external-API dependencies.** The skill
agent runs on the existing Phase 9.0c wllama runtime; no new
service / env var / partner credential. The new BE registry at
`/api/skill-agents` serves SAME-ORIGIN catalog metadata (admin-
curated pointers; the FE prompt body never crosses into a BE row).
The SLM USP arc (SLM-E/F/G/H) is now arc-complete with zero
cumulative external-API dependencies. The parallel revenue-lines
Phase 13.x items at §4.1 UPI rails and §4.2 IFSC lookup remain
the only outstanding 13.x entries that will touch this doc.)

## Legend

| Status | Meaning |
|---|---|
| ✅ Live-ready | Adapter shipped; only need to flip env var when keys arrive |
| 🧪 Stub-only | Adapter shipped, stub returns deterministic demo data; live mode needs commercial / sandbox credentials |
| 📋 Reserved | Adapter shape designed, not yet built; awaiting consumer surface |
| 🚧 Roadmap | Not yet designed; on the long-tail backlog |

## 1. Geo + address

### 1.1 OSM Nominatim reverse geocoding ✅ Live-ready

- **Adapter**: [`src/phase1/nominatim-geocoder.mjs`](../src/phase1/nominatim-geocoder.mjs)
- **Upstream**: `https://nominatim.openstreetmap.org/reverse`
- **Cost**: FREE (community-hosted, no key)
- **Usage policy**: 1 req/sec hard cap, polite User-Agent
  with contact info, no bulk usage. The substrate enforces
  all of this.
- **To go live**: `BHARAT_OS_NOMINATIM_MODE=live`. No
  registration. Already complies with the usage policy.
- **What it does**: Turns a 1dp lat/lng bubble into
  "Near Shivajinagar, Pune". Used in
  ProviderBookingDetail + citizen booking detail.
- **Phase shipped**: 12.2.1 (ADR 0141).

### 1.2 India Post PIN-code lookup ✅ Live-ready

- **Adapter**: [`src/phase1/india-post-pincode.mjs`](../src/phase1/india-post-pincode.mjs)
- **Upstream**: `https://api.postalpincode.in/pincode/<PIN>`
- **Cost**: FREE (community-maintained, no key)
- **Usage policy**: No formal cap; the substrate uses
  5 req/sec polite.
- **To go live**: `BHARAT_OS_PINCODE_MODE=live`. No
  registration.
- **What it does**: PIN → `{city, district, state, branches[]}`.
  Powers the KYC L1 wizard's address step auto-fill.
- **Phase shipped**: 12.2.2 (ADR 0142).

## 2. Identity verification (driving / vehicle)

### 2.1 Parivahan (Sarathi DL + Vahan RC) 🧪 Stub-only

- **Adapter**: [`src/phase1/parivahan-adapter.mjs`](../src/phase1/parivahan-adapter.mjs)
- **What it does**: Pre-verifies the typed driving licence
  number + vehicle registration number on cab-driver /
  personal-driver role-extras submissions. Operator
  console shows a verification badge (✓ verified /
  ⚠ mismatch / ⏳ pending) so manual cross-check against
  the photo becomes one-click instead of doc-by-doc.
- **Stub mode** (default): returns deterministic "valid"
  verification with a fake holder name + validity date.
  Demo deployments without credentials render the full
  citizen → operator review loop end-to-end.
- **To go live**: There is **no official public API** for
  parivahan.gov.in individual lookups. Three real options
  to provision:
  - **DigiLocker DL/RC fetch** (UIDAI / GoI) — cleanest,
    citizen-authenticated, signed documents back. Requires
    UIDAI / DigiLocker partner registration + sandbox key.
    Env: `BHARAT_OS_PARIVAHAN_MODE=live`,
    `BHARAT_OS_PARIVAHAN_PROVIDER=digilocker`,
    `BHARAT_OS_DIGILOCKER_CLIENT_ID`,
    `BHARAT_OS_DIGILOCKER_CLIENT_SECRET`.
  - **Surepass / Karza / IDfy / Signzy** — commercial
    aggregators that wrap parivahan via web-scraping.
    ₹1-5 per check, no government registration needed.
    Env: `BHARAT_OS_PARIVAHAN_PROVIDER=surepass`,
    `BHARAT_OS_SUREPASS_TOKEN`.
  - **Direct parivahan.gov.in scraping** — not recommended
    (captchas, ToS).
- **Phase shipped**: 12.2.5 (ADR 0145).

## 3. Identity verification (govt-issued IDs)

### 3.1 DigiLocker (Aadhaar e-KYC + signed docs) 🧪 Stub-only

- **What it does**: Replace the "Aadhaar last-4 ONLY"
  defensive posture in KYC L1 (Phase 12.2.2) with a real
  citizen-authenticated e-KYC. The citizen signs in via
  DigiLocker, Bharat OS receives a signed verification
  token. No Aadhaar number ever touches our servers.
- **Adapter**: [`src/phase1/digilocker-substrate.mjs`](../src/phase1/digilocker-substrate.mjs)
  shipped in Phase 12.2.6. OAuth2 helpers + signature
  verification + token storage + DPDP cascade. Wired into
  the Parivahan adapter as the `digilocker` provider.
- **Stub mode** (default): deterministic OAuth flow with a
  stub-prefixed code + deterministic signed-document
  response. Demo deployments without partner credentials
  exercise the citizen → operator review loop end-to-end.
- **Upstream**: `https://api.digitallocker.gov.in/public/oauth2/1/`
- **Cost**: Free for citizen-side; partner registration
  with MeitY required.
- **To go live**:
  - Register as a DigiLocker Partner at
    https://partners.digitallocker.gov.in/.
  - Receive sandbox `client_id` + `client_secret`.
  - Production approval requires SOC 2 / ISO 27001
    self-attestation + data-localisation compliance check.
- **Env**:
  - `BHARAT_OS_DIGILOCKER_MODE=live`
  - `BHARAT_OS_DIGILOCKER_CLIENT_ID`
  - `BHARAT_OS_DIGILOCKER_CLIENT_SECRET`
  - `BHARAT_OS_DIGILOCKER_REDIRECT_URI` (production redirect
    URL; same-origin callback is auto-allowed)
- **§15 bindings**: access + refresh tokens NEVER returned
  by `/status` and NEVER on the audit ledger. State is
  one-shot + 10-min TTL + bound to rootIdentityId server-
  side. DPDP cascade erases both `digilocker_states` and
  `digilocker_links` atomically with the identity.
- **Phase shipped**: 12.2.6 (substrate stub; live wires
  in additively); **12.2.7** (citizen-facing "Link
  DigiLocker" surface at top of KYC L1 wizard).

### 3.2 PAN verification (NSDL / Income Tax) 📋 Reserved

- **Why**: Phase 12.2.2 stores PAN last-4 only. Real
  verification confirms (a) the PAN exists, (b) the name
  on PAN matches the citizen's typed legal name.
- **Upstream**:
  - NSDL e-Gov API (https://onlineservices.nsdl.com/)
  - OR commercial wrappers (Surepass, Karza)
- **Cost**: NSDL ₹1.65 per check (volume tiered);
  commercial ~₹2 per check.
- **To provision**: NSDL requires PAN of a TIN-FC
  representative + business registration. Commercial
  wrappers are easier for MVP.
- **Env**: `BHARAT_OS_PAN_VERIFY_MODE`,
  `BHARAT_OS_PAN_VERIFY_PROVIDER`,
  `BHARAT_OS_PAN_VERIFY_TOKEN`.
- **Phase**: Reserved.

### 3.3 GST verification (GSTN) 🧪 Stub-only

- **Adapter**: [src/phase1/gst-adapter.mjs](../src/phase1/gst-adapter.mjs)
  — composes `createAdapter` (Phase 12.2.1).
- **Why**: Phase 12.3 `kirana` provider role accepts an
  optional GSTIN. The adapter checks shape with
  `GSTIN_RE` (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$`)
  before calling upstream, and the operator console gates
  attestation on the per-field badge.
- **Upstream**: GSTN public API at
  `https://services.gst.gov.in/services/api/`. Provider
  allowlist: `stub | sandbox | surepass | karza | gsp-direct`.
- **Cost**: GSTN direct is free with GSP partnership;
  commercial wrappers ~₹2-3 per check.
- **To go live**: GSP (GST Suvidha Provider) partnership
  via CDAC takes 2-4 weeks, OR commercial wrapper
  (Surepass / Karza) for MVP (one-day signup).
- **Env**: `BHARAT_OS_GST_MODE` (defaults to `stub`),
  `BHARAT_OS_GST_PROVIDER`,
  `BHARAT_OS_GST_TOKEN`.
- **Posture**: cacheKey = `gst:<sha256(GSTIN).slice(0,32)>`
  — raw GSTIN never lands on the cache key or ledger
  (only field IDs + status). Polite UA shipped.
- **Phase shipped**: 12.3 (stub-only; live path needs
  partner provisioning).

## 4. Payments + rails

### 4.1 UPI rails (NPCI) 🚧 Roadmap

- **Why**: Phase 12.1a.2 escrow + settlement is
  "bookkeeping-v1" today — no real money moves; the
  ledger pretends. Going live requires a real UPI rail.
- **Two paths**:
  - **PA/PG model** (Razorpay, Cashfree, Paytm) — fastest;
    aggregator handles compliance. Per-transaction fee.
  - **Direct UPI / NPCI integration via sponsor bank** —
    requires bank tie-up + PSP licensing. 18-month
    timeline.
- **Env (PA model)**: `BHARAT_OS_UPI_PROVIDER`,
  `BHARAT_OS_RAZORPAY_KEY_ID`,
  `BHARAT_OS_RAZORPAY_KEY_SECRET`.
- **Phase**: Roadmap (Phase 13.x or 14+).

### 4.2 IFSC bank lookup (Razorpay public) 📋 Reserved

- **Why**: When providers add bank accounts for payout,
  validate + auto-fill bank name + branch from IFSC.
- **Upstream**: `https://ifsc.razorpay.com/<IFSC>` —
  FREE, no key.
- **To go live**: `BHARAT_OS_IFSC_MODE=live`. No
  registration needed (same as Nominatim / India Post).
- **Env**: `BHARAT_OS_IFSC_MODE`.
- **Phase**: Reserved for the first provider-payout
  surface (Phase 13.x).

## 5. Messaging

### 5.1 SMS — Gupshup / MSG91 / Twilio / Karix 🧪 Stub-only

- **What it does**: Phone OTP send (Phase 12.0.1). The
  `log` provider prints to stdout for dev/demo;
  every commercial provider stays a stub until partner
  credentials arrive.
- **Adapter**: [`src/phase0/sms-provider.mjs`](../src/phase0/sms-provider.mjs)
- **Stub mode**: `log` provider (just emits a structured
  log line — citizen reads the OTP from console for demo).
- **Circuit breaker + bulkhead**: `BHARAT_OS_SMS_TIMEOUT_MS`,
  `BHARAT_OS_SMS_CIRCUIT_THRESHOLD`,
  `BHARAT_OS_SMS_CIRCUIT_OPEN_MS`,
  `BHARAT_OS_SMS_BULKHEAD_MAX`.
- **To go live**: Pick a provider, register, fund prepaid
  account. Per-SMS cost ~₹0.18 (Gupshup) - ₹0.30 (Twilio).
- **Gupshup**: `BHARAT_OS_SMS_PROVIDER=gupshup` +
  `BHARAT_OS_SMS_GUPSHUP_USERID` +
  `BHARAT_OS_SMS_GUPSHUP_PASSWORD` +
  `BHARAT_OS_SMS_GUPSHUP_SOURCE` (DLT sender ID) +
  optional `BHARAT_OS_SMS_GUPSHUP_PRINCIPAL_ENTITY_ID` +
  `BHARAT_OS_SMS_GUPSHUP_TEMPLATE_ID` (DLT template).
- **MSG91**: `BHARAT_OS_SMS_PROVIDER=msg91` +
  `BHARAT_OS_SMS_MSG91_AUTH_KEY` +
  `BHARAT_OS_SMS_MSG91_SENDER_ID` (6-char DLT) +
  optional `BHARAT_OS_SMS_MSG91_FLOW_ID`.
- **Twilio**: `BHARAT_OS_SMS_PROVIDER=twilio` +
  `BHARAT_OS_SMS_TWILIO_ACCOUNT_SID` +
  `BHARAT_OS_SMS_TWILIO_AUTH_TOKEN` +
  `BHARAT_OS_SMS_TWILIO_FROM` (E.164 number or Messaging
  Service SID).
- **Karix**: `BHARAT_OS_SMS_PROVIDER=karix` +
  `BHARAT_OS_SMS_KARIX_USERNAME` +
  `BHARAT_OS_SMS_KARIX_PASSWORD`.
- **OTP debugging**: `BHARAT_OS_LOG_OTP_BODIES=1` echoes
  the OTP body into the access log (dev only — never
  enable in production).
- **Phase shipped**: 12.0.1 (stub provider only; commercial
  providers wired but unreachable without credentials).

### 5.2 Web Push (VAPID) ✅ Live-ready

- **What**: Browser push notifications via the standard
  VAPID protocol (no third-party service).
- **Status**: VAPID keypair provisioned + Phase 8.4 shell
  installation flow wired. No external API needed —
  push goes citizen-device ↔ browser-push-service-provider
  (Firebase/Mozilla/Apple) directly.
- **Phase shipped**: 8.4.

### 5.3 ABDM / ABHA (health stack) 📋 Reserved

- **What**: Already integrated in the shell side
  (`public/shell/`) for the health passport use case.
  Citizen authenticates with ABHA; Bharat OS pulls
  consented health documents.
- **Status**: Shell-side prototype lives in
  `public/shell/app.js`; the React app side is on the
  roadmap.
- **To go live**: ABDM Health Information Provider /
  Health Information User registration with NHA
  (https://abdm.gov.in/). Sandbox at
  `https://dev.abdm.gov.in/`.
- **Env**: `BHARAT_OS_ABDM_HIU_ID`,
  `BHARAT_OS_ABDM_CLIENT_ID`,
  `BHARAT_OS_ABDM_CLIENT_SECRET`.
- **Phase**: Reserved for `/app/` health surface.

## 6. Marketplace bridges

### 6.1 ONDC bridge 📋 Reserved (hidden v1)

- **Why**: Bootstrap density. When the Bharat OS native
  provider pool is thin in a city, fall back to ONDC
  (Open Network for Digital Commerce) listings.
- **Binding**: `memory/ondc-bridge-hidden-v1.md` —
  citizens see ONLY native providers by default; ONDC
  fallback triggers an "invite a provider" empty state
  rather than ONDC results.
- **Upstream**: ONDC gateway endpoints + protocol
  buyer-app spec.
- **To go live**: ONDC participant registration at
  https://ondc.org/. Free; sandbox URLs available.
- **Env**: `BHARAT_OS_ONDC_MODE`,
  `BHARAT_OS_ONDC_BAP_ID`,
  `BHARAT_OS_ONDC_BAP_URI`,
  `BHARAT_OS_ONDC_SIGNING_KEY`.
- **Phase**: Reserved.

## 7. Operator + compliance

### 7.1 DPDP audit signer (Ed25519) ✅ Live-ready

- **What**: Internal substrate — generates Ed25519
  audit-event signing keys for tamper-evident ledger
  export.
- **Status**: Substrate ships; key generation on first
  run. No external API.
- **Phase shipped**: 10.5.

### 7.2 Admin token (operator console auth) ✅ Live-ready

- **What**: `Authorization: Bearer <BHARAT_OS_ADMIN_TOKEN>`
  gates every operator endpoint.
- **To go live**: Set `BHARAT_OS_ADMIN_TOKEN` (≥16 chars)
  per environment. Rotate quarterly + after suspected
  leak.
- **Phase shipped**: 5.7.

## Summary — what blocks the production cutover

For the **MVP investor pitch**: nothing on this list is
blocking. Every adapter has a working stub; the demo flows
end-to-end on stub data.

For **real production with money + identity at stake**, in
priority order:

1. **Phone OTP provider** (Karix / Gupshup) — required for
   real sign-up. ~1 day integration once keys land.
2. **DigiLocker for Aadhaar e-KYC** — required to upgrade
   from "last-4 only" defensive posture. ~2 weeks
   including partner approval.
3. **Parivahan provider** (DigiLocker DL/RC OR Surepass) —
   required for honest cab-driver / personal-driver
   onboarding. ~3 days once provider chosen.
4. **UPI rail** (Razorpay PA) — required for real
   booking-settlement money flow. ~1 week including
   PCI/aggregator agreement.
5. **PAN verification** (Surepass) — required to upgrade
   from "last-4 only" PAN. ~2 days.
6. **GST verification** — stub-only adapter shipped
   (Phase 12.3, `kirana` role). Live needs GSP partnership
   (2-4 wks) OR Surepass / Karza wrapper (~3 days).
7. **ABDM / ABHA** — required for full health passport in
   the React app. ~2 weeks including HIU registration.
8. **ONDC bridge** — strategic; not blocking. ~1 week.

**Estimate to flip everything live**: ~6 weeks of
integration once credentials and partner approvals are in
hand. Most of that is partner-approval calendar time, not
engineering time — every adapter shape is already in
place via the external-adapter substrate.
