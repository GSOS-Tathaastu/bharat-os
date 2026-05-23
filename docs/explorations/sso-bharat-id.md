# Design Exploration — Bharat ID, SSO, and "log in with Bharat OS"

> **Status: exploration, not decision.** This document maps the design
> space for a single-sign-on / federated-identity feature so we can
> decide whether to build it, in what shape, and at which phase. No
> code commitment until you sign off on a direction.

## The user-facing ask

> *"If I'm logged into Bharat OS, I shouldn't have to log into other
> apps again. Bharat OS should vouch for me."*

That's the natural reading. Investors hear it as *"Sign in with
Bharat OS"* — the equivalent of *Sign in with Google / Apple / Phone
Number*. It's a compelling pitch: every Indian carries one
identity, one consent ledger, one passkey, and every app on their
phone (or every website they visit) trusts it.

But how that resolves into a feature depends on three things:

1. **Who is the verifier?** The third-party app's own server, or a
   Bharat OS endpoint that the app calls?
2. **What information moves?** A bare assertion that the user is
   logged in, or named claims (name, age, mobile, Aadhaar-ref,
   ABHA-ref, employer)?
3. **Does Bharat OS see which apps you're using?** This is the
   tracking question. *Sign in with Google* sees every site you log
   into; *Sign in with Apple* anonymizes the email but still sees the
   login event. Bharat OS's §15 binding forbids both.

## §15 bindings that constrain the design

Five lines from §15 fix the shape of any acceptable answer:

| §15 binding | Constraint on SSO |
|---|---|
| **Identity is the person, not the device** | The token a relying party gets must bind to the *person*, not to one device. A second device of the same household-identity (post §7c pairing) must produce the same identity to the relying party. |
| **Pointer, not payload** | The relying party gets a *reference* it can verify, not the underlying PII. *Yes this user is over 18*, not their date of birth. |
| **Aadhaar optional, never mandatory** | An SSO that *requires* an Aadhaar-backed identity defeats §15. Self-sovereign + Aadhaar-backed must both be valid login modes. |
| **Never sell user data** | Bharat OS cannot be a *tracking IdP*. If the design lets Bharat OS observe "user X logged into app Y at time T", that creates a data asset we're forbidden to monetize and a security target we don't want. |
| **Monetize businesses, never the citizen** | The *relying party* pays per verified login (analogous to §13A #4 B2B verified-workflow fees), not the user. |

The combination of *pointer-not-payload* + *Bharat OS must not see
which app you logged into* rules out vanilla OIDC and makes
**Verifiable Credentials (W3C VC / DID) the natural fit**.

## Four design options

### Option A — Classic OIDC IdP ("Sign in with Bharat OS")

Bharat OS runs an OpenID Connect provider. Relying-party apps
redirect users to `bharat-id.in/authorize`; Bharat OS authenticates
the user (passkey/biometric), shows a consent screen ("AcmeApp
wants your name + email"), and redirects back with an ID token.

**Pros:**
- Universal compatibility — every login library in every language
  speaks OIDC.
- One-button integration for apps that already wire Google/Apple
  login.
- Fastest path to a demoable *"Sign in with Bharat OS"* button.

**Cons:**
- **Bharat OS sees every login event.** The authorize endpoint
  receives `client_id` (which app), `redirect_uri`, scopes, user.
  This is the tracking-IdP problem §15 forbids.
- Tokens are bearer JWTs — interception = impersonation.
- Requires Bharat OS to be online for every login. Doesn't work on
  the mesh / when the user is offline.
- The *control* still sits with us; we can't credibly promise the
  app developer that we won't shadow-ban or revoke them.

**Verdict:** Too compromising of §15. Could be a *transitional*
mode (V0) to show investors a button works, but not the destination.

### Option B — Verifiable Credentials / DIDs (W3C / Sovrin / Hyperledger Indy pattern)

Bharat OS issues *Verifiable Credentials* to the user: signed JSON
documents like `{ subject: did:bharat:xyz, age: ">= 18", issued_by:
bharat-os, signature: ... }`. The user holds them in their L5
encrypted vault. When an app needs to verify, the user *presents*
the credential directly to the app — Bharat OS is not in the loop.

The app verifies the signature against Bharat OS's public key (or
the DID document on a public registry). The app learns *"this user
is over 18"* without learning the date of birth, and Bharat OS
learns nothing about the login event.

**Pros:**
- **Bharat OS sees nothing.** Logins happen peer-to-peer; we're
  the issuer, not the relayer. §15 tracking concern resolved
  cleanly.
- **Selective disclosure.** Zero-knowledge proofs or BBS+ signatures
  let the user disclose `age >= 18` without revealing the underlying
  date of birth — a literal implementation of *pointer-not-payload*.
- **Works offline.** Once the credential is in the user's vault,
  presenting it to an app needs no network call to Bharat OS.
- **Self-sovereign by design** — fits the §6 / §15 architecture.
- Already standards-backed: W3C VC Data Model 2.0, DIDs, BBS+,
  SD-JWT.

**Cons:**
- **No off-the-shelf relying-party UX.** Apps would need to embed a
  VC verifier library — minor for new apps, real friction for
  existing ones.
- Slower investor demo — *"the app embeds a verifier"* is harder to
  pitch than *"add a button"*.
- Wallet UX is novel territory. *"Tap to present credential"* is a
  workflow most users have never seen.

**Verdict:** The right *substantive* answer. The §15 bindings
demand it. But it's a 6–12 month curve in the wild before any
relying party adopts.

### Option C — DigiLocker / Aadhaar-pattern federation

Don't build a new identity at all. Bharat OS becomes a *thin
custodian* over the existing IndiaStack identities (Aadhaar,
DigiLocker, ABHA, AA). When an app wants to verify identity, it
goes through the standard DigiLocker / UIDAI eKYC flow, but with
Bharat OS as the **consent broker** that records the share in the
L4 ledger and produces an audit hash.

**Pros:**
- **Zero new infrastructure.** Reuses UIDAI / DigiLocker / NHA /
  Sahamati rails — they're the regulatory truth anyway.
- **Regulatory clarity.** The verification mechanism is already
  approved by RBI / MeitY / NHA. We're not asking anyone to trust
  a new authority.
- The relying-party app sees exactly what DigiLocker / eKYC would
  have shown them, with a Bharat OS consent receipt added.

**Cons:**
- **Aadhaar-mandatory.** Violates the §15 *"Aadhaar optional, never
  mandatory"* binding. A user without an Aadhaar number gets no
  SSO at all.
- **Bharat OS is just a UX layer**, not a primitive — we don't own
  identity, just consent.
- Still leaks the login event to UIDAI / NHA / DigiLocker (UIDAI
  knows every authentication request).
- Doesn't generalize beyond Indian-government services. An
  international app won't onboard via DigiLocker.

**Verdict:** Useful as a *complementary* layer for the regulated
flows where IndiaStack is already mandatory (NBFC onboarding, ABHA
record release). Not a satisfying answer for the general SSO ask.

### Option D — Hybrid (recommended for exploration)

Three tiers, layered:

1. **Tier 1 — DigiLocker / IndiaStack consent broker** (Option C):
   for regulated flows where IndiaStack is already the law (NBFC,
   ABHA, AA). Already built — *this is what §9C vignettes 1, 3,
   12, 16a do today.* Brand it: *"Sign in with Aadhaar via Bharat
   OS"*.

2. **Tier 2 — Verifiable Credentials** (Option B): for general
   consumer apps, B2B portals, and websites. Bharat OS issues
   credentials at onboarding (`bharat-id`, optional `age >= 18`,
   optional `kyc-verified`, optional `india-resident`); the user
   presents them peer-to-peer; Bharat OS sees nothing. Brand it:
   *"Sign in with Bharat ID"*.

3. **Tier 3 — OIDC compatibility shim** (Option A, gated): for apps
   that *must* use OIDC and won't adopt VC in the near term, Bharat
   OS runs an OIDC bridge — but only on the user's own device.
   The OIDC token is issued by a *local* Bharat OS service running
   on the phone (Phase 2b AOSP shell), not by a central server.
   The relying-party app does not learn that Bharat OS is involved
   unless the user discloses it. **Bharat OS the company sees
   nothing.** Brand it: *"Bharat OS Login Helper"* — explicitly
   framed as a compatibility tool, not the architectural answer.

This staircase respects §15 at every step: Tier 1 reuses existing
regulated rails; Tier 2 is the substantive answer; Tier 3 is a
compatibility convenience that runs on the user's device, not on
Bharat OS servers.

## What changes for the §6 architecture

This is genuinely a new responsibility layered onto §7c (identity)
and §4 (control plane). Adding *"Bharat ID — federated identity for
third-party apps"* as a sub-section of §7c is the cleanest place.
The relevant additions:

- **§7c.1 Issuance.** At onboarding (or any later voluntary
  upgrade), Bharat OS issues a `BharatId` credential — a signed
  JSON document with the user's stable identifier and any optional
  attestations they've added (Aadhaar-ref, ABHA-ref, mobile,
  household-member-of-X, business-pro-tier).
- **§7c.2 Presentation.** When an app requests identity, the user
  is shown a consent screen ("AcmeApp wants: name, age over 18,
  phone country"). On approval, the credential (or a selective-
  disclosure proof of it) is signed and handed to the app. The
  request is recorded in the L4 consent ledger on-device only.
- **§7c.3 Verification.** Apps verify against the published Bharat
  OS issuer key (rotated quarterly). No callback to Bharat OS
  needed.
- **§7c.4 Revocation.** A signed revocation list, fetchable but not
  required — apps that don't fetch it accept slightly stale
  credentials, which is the same trade-off all VC systems make.

The L4 audit ledger gains a new event type
`bharat_id.credential_issued` and a new policy
`policy.identity.federated_login` that enforces the consent screen.

## Phase placement

| Phase | Item | Why here |
|---|---|---|
| **2a (PWA, now)** | This doc; specification of `BharatId` credential shape; demo issuer key; a `/api/bharat-id/issue` + `/api/bharat-id/verify` pair of endpoints; a `/shell/` "Show my Bharat ID" card that displays the credential. **No relying-party integration yet** — just proving the artifact. | Demoable in the existing PWA; no AOSP dependency. |
| **2b (AOSP shell)** | Tier 3 OIDC compatibility shim runs as a local service on the phone, intercepts `bharat-id://` deep links from third-party apps, presents the consent screen, signs and returns the credential. | Needs OS-level intent-handling that a PWA cannot provide. |
| **2c (full ROM)** | Tier 1 native DigiLocker integration becomes a system-level service; Tier 2 VC presentation is the default mode for any app that asks. | Needs OEM partnership for system-level credential broker. |
| **Phase 3** | Federated revocation registry; international VC interop (W3C, EUDI Wallet); cross-border consent enforcement. | DPI export story (§10A precedent: MOSIP). |

## Open questions for you

1. **Brand.** *"Bharat ID"* vs *"Sign in with Bharat OS"* vs
   *"Bharat Login"* vs *"भारत पहचान"*. Investor-facing language
   matters; this is a category-defining brand if it works.

2. **Does the Aadhaar-ref attestation matter at launch?** If yes,
   Tier 1 is part of the v1 spec; if no, Tier 2 alone is the v1 and
   Tier 1 plugs in later. The §15 binding says Aadhaar must always
   be *optional*, but it doesn't say it must be absent at v1.

3. **Revenue model.** §13A is silent on identity-as-a-service today.
   Options:
   - Per-verified-login fee charged to the relying-party app
     (matches §13A #4 B2B verified-workflow fees) — clean and §15-
     aligned.
   - Free for citizens, free for verifiers, monetized indirectly via
     the *trust* it adds to other Bharat OS surfaces.
   - Tiered: free for verifiers below a volume threshold, fee
     above. Mirrors UPI's free-for-users / fee-for-PSPs pattern.

4. **Self-sovereign rotation.** If a user's phone is lost, what
   happens to credentials presented before the loss? The §7c device
   pairing model already provides the answer (recovery phrase →
   re-bind), but the revocation flow needs naming.

5. **Patent / IP space.** §14A doesn't currently cover the SSO
   surface. Sovrin / Spruce / Trinsic / EUDI Wallet are the prior
   art; selective-disclosure-with-consent-receipt is well-
   documented. Worth a defensive note in §14A once the architecture
   firms up.

6. **Phase 2a scope.** The minimum *demoable* surface in Phase 2a
   is the credential issue + verify pair + a shell card. The
   minimum *useful* surface is one third-party demo verifier — a
   small Node.js server that says "I trust Bharat OS issued
   credentials". One day of work each. Acceptable scope?

## Recommendation

**Park the build commitment until you've reviewed this doc.** Once
you do:

- If you agree with the **hybrid (Option D)** direction, the
  Phase 2a slice is small enough that I can ship it as one ADR
  (~0066) after the §7c vault encryption work (2a.17) lands.
- If you want the **classic OIDC button** for an investor moment
  ahead of the substantive build, that's Tier 3 first — but I'd
  flag the §15 tension explicitly and document it as a transitional
  shim.
- If you want **DigiLocker-only** for now (Option C), there is
  actually almost nothing new to build — §9C vignette 12 already
  describes the pattern; we'd just brand it as "Bharat ID" and
  expose the existing consent receipt as the SSO artifact.

I'd recommend Option D, with Phase 2a shipping the Tier 2 VC
artifact (no relying-party integration, just the credential + a
demo verifier) so the architecture is provably substantive before we
add the OIDC convenience.
