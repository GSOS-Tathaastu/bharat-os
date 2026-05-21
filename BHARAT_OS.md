# BHARAT OS — Canonical Product & Architecture Reference

> Single source of truth for the **Bharat OS** thesis. Any agent (Claude Code,
> Copilot, a chat session) working on Bharat OS reads this first. It is the
> complete record of the reasoning behind the product — the landscape it sits in,
> why the obvious version is impossible, what is actually buildable, the full
> eight-layer architecture, the moat, the economics, the competition, and the
> honest cost of building it.

---

## 0. Scope statement (binding — read first)

**Bharat OS is an independent product and an independent company.**

It is **NOT**:
- an umbrella narrative over GSOS/TATHAASTU, OmniQuant, SIP, or Moneytrail;
- dependent on any of them;
- bootstrapped by hosting their workloads as "anchor tenants";
- a vertical, feature, or downstream product of any of them.

Those are separate ventures with separate roadmaps. Do not fold them into the
Bharat OS thesis, do not cite them as demand sources, and do not use them as
examples in Bharat OS materials. Bharat OS stands entirely on its own.

Bharat OS shares technical DNA with **Project Saarthi** (vernacular voice +
IndiaStack) but is a **separate product**. Saarthi is not "Phase 0 of Bharat OS,"
and Bharat OS is not "Saarthi grown up." They may validate similar primitives
independently, but neither depends on the other.

---

## 1. What Bharat OS is

**One sentence:**
> Bharat OS is India's sovereign, AI-native operating system: a vernacular
> generative interface running on a KYC'd compute-and-storage mesh, where every
> decision is identity-anchored, consent-bound, and policy-reasoned through
> IndiaStack — built so India's 1.4 billion people can talk to software in their
> own language and have it actually *do* things.

In plain terms: it is an **AI-native shell on an AOSP/Linux substrate** — not a
new kernel — where the home screen is replaced by an agent, apps are replaced by
skills, and the interface is generated on demand from spoken intent in any of 22
Indian languages. Underneath, the same devices form a peer-to-peer mesh that
serves AI inference and stores encrypted data, settled in rupees over UPI, with
identity anchored to Aadhaar (optionally) through IndiaStack.

It combines three things **no global competitor stacks together**: vernacular-
native UX, a DePIN compute/storage mesh owned *at the OS layer*, and IndiaStack-
anchored sovereign identity.

---

## 2. The thesis, in full

The instinct behind Bharat OS is correct and the timing is real, but the obvious
framing ("build a new OS to replace Android/Windows") is a trap. The thesis only
works once you separate three questions that founders usually blur together:

1. **Is the app-grid OS metaphor dying?** Yes. The next decade's winners are
   agent-native systems where intent materializes interfaces. Brain.ai shipped
   exactly this in Japan in April 2026; AGI Inc. and Rabbit are thinner versions.
   The category is no longer speculative — it is shipping.

2. **Can a new entrant win at the kernel layer?** No. That war is over (see §4).
   Every "OS" worth admiring is a fork-plus-shell, not a kernel. The winnable
   layer is the **agent / intent layer** above the substrate.

3. **What can an Indian builder win that the incumbents structurally cannot?**
   This is the whole game. Brain.ai, Apple, and Google are English-first,
   cloud-dependent, and have no access to India's public digital infrastructure.
   An India-first OS that is vernacular-native, sovereign-identity-anchored, and
   mesh-powered occupies ground none of them can take.

Put together: **don't build the kernel; build the AI layer; fork AOSP as the
substrate; make it vernacular, sovereign, and mesh-native; and ship it as a
flashable ROM + reference shell + skill marketplace.** That is Bharat OS.

---

## 3. The landscape — five kinds of "AI OS" that already exist

Before claiming the space, know what's in it. "AI OS" already means five different
things, and conflating them is how founders waste years:

1. **AI-augmented traditional OSes.** Incumbents retrofitting AI into existing
   kernels: Microsoft Copilot+ PCs, Apple Intelligence, Google Gemini in Android/
   ChromeOS. Not new OSes — the moat-holders defending their turf.
2. **Consumer "AI-first" device OSes.** Full attempts at native AI operating
   systems: Rabbit R1 / RabbitOS (stumbled on reliability), Humane AI Pin (failed),
   and **Brain.ai's Natural OS** — the most credible, now selling via SoftBank in
   Japan. Verdict so far: hard, but proven possible.
3. **Enterprise / industrial AI OS.** The biggest category by revenue — Palantir
   AIP (~$400B+ market cap), VAST Data's AI OS, Siemens-NVIDIA industrial AI OS.
   Proves enterprises pay seven/eight figures for vertical AI operating systems.
4. **Agent OS / LLM-as-kernel.** Research-grade: AIOS (Rutgers) treats the LLM as
   the kernel and agents as applications, with OS-like scheduling/memory/tools.
   Architecturally the most interesting direction.
5. **Vertical "business OS."** SaaS branded as OS for a specific domain. A real,
   fundable shape — but a different game from a consumer device OS.

Market signal: the global AI-OS market was ~$7.22B in 2025, projected ~$35.74B by
2030 (~28% CAGR) — but the bulk is enterprise, not consumer kernel replacement.
**Bharat OS targets category 2 (consumer AI-first), which is the hardest and the
least crowded for an India-first, sovereign play.**

---

## 4. Why kernel-level OS is closed — the seven moats

Building a Windows/macOS/Android replacement at the kernel level is not "hard
coding" — it is structurally closed by seven moats that have killed every
well-funded attempt. Bharat OS exists *because* of this constraint, not in spite
of it: it deliberately sits above the substrate.

1. **Kernel & low-level stack.** Decades of work. Linux: 30+ years, ~30k
   contributors. HarmonyOS NEXT: ~5 years, multi-thousand engineers, billions,
   and a bespoke microkernel. Fuchsia: ~9 years, still not at consumer scale.
2. **Drivers & hardware compatibility.** The hidden killer. Every chipset, GPU,
   modem, sensor, codec needs a driver. Linux still fights WiFi/sleep/battery on
   random laptops after 30 years. The only sane move is to *inherit* Android/Linux
   drivers by forking — which means you're building a shell.
3. **App ecosystem (the chicken-and-egg graveyard).** What actually kills new
   OSes. Windows Phone died with infinite money behind it. Firefox OS, Symbian
   ($250M), MeeGo — all gone. Even Huawei, with state backing and a captive
   1.4B-person market, struggles to get real apps onto HarmonyOS.
4. **Distribution & OEM leverage.** Even a brilliant OS needs to get onto devices.
   You need either your own hardware (Apple's $100B+ path) or a regulator/state
   forcing OEMs (Huawei's path). A new entrant has neither.
5. **Cross-device.** "Works on all devices" is *harder* than one OS, not easier —
   different inputs, densities, thermals, power. Apple pulls it off only by owning
   the silicon.
6. **Capital & timeline.** A credible cross-device kernel OS is $500M–$2B over
   5–10 years. Microsoft burned ~$10B on Windows Phone and lost.
7. **Maintenance forever.** Monthly security patches, kernel/driver updates, new
   chips — for 20+ years, or users get pwned. Hundreds of engineers in perpetuity.

**Conclusion:** fork AOSP, build an AI-native shell, bootstrap on one device class.
You inherit the kernel (driver problem solved), Android app compatibility
(ecosystem ~90% solved on day one), and total freedom to redesign the experience
layer. ~$1–5M and 12–24 months to a credible shell MVP, versus impossible for a
kernel. The kernel war is won by others; the agent/intent war is open.

---

## 5. Generative computing — what's real, what's fantasy

A more radical version of the idea is "the OS generates everything on demand — UI,
apps, even drivers — from user intent." Graded honestly, three of the four
components are real and one is structurally blocked:

- ✅ **Generate UI / "apps" on demand from intent.** Real and shipping. This is
  Brain.ai's core ("UI from words, UI from UI, in milliseconds"); v0/Bolt/Lovable
  do it for web. Buildable on top of a frontier LLM + a UI rendering engine.
- ✅ **Marketplace for generated skills/agents.** Real and emerging — the MCP
  pattern, GPT Store, Anthropic Skills. The "user generates → others consume" loop
  works.
- ⚠️ **OS reshapes itself by available compute/storage.** Partially real. Linux
  already does dynamic resource management; what's new is *model-routing*
  intelligence (pick a 1B local model vs a 70B cloud model by battery/compute/net).
  Solvable as a router layer.
- ❌ **AI codes drivers for the hardware it's installed on.** Mostly fantasy — and
  *not* because of AI capability. It is structurally blocked by: proprietary signed
  firmware blobs (GPU/modem/secure-enclave — not generatable); unpublished
  datasheets (nothing to "code from"); hard real-time constraints (USB-3
  microsecond timing, sub-10ms audio, 16.6ms frames); brick risk (one bad flash
  write destroys hardware); certification (cellular/banking/DRM need certified,
  not generated, code); and security (runtime-generated kernel code is the worst
  possible attack surface).

The realistic version: **don't generate drivers — inherit Linux's ~30M lines of
existing driver code, and let the AI layer adapt user-space dynamically.** If
genuinely kernel-level adaptivity is ever needed, the responsible path is
sandboxed, kernel-verified eBPF programs with a verifier — not free-form code
generation. This is the same pattern every credible AI-OS (including Brain.ai)
actually uses.

---

## 6. The eight-layer architecture

```
┌──────────────────────────────────────────────────────────────┐
│ L8 — VERNACULAR GENERATIVE UI (22 languages, voice-first)      │
├──────────────────────────────────────────────────────────────┤
│ L7 — INTENT → DECISION ORCHESTRATOR                            │
│      policy reasoning · consent interpretation · tool selection│
├──────────────────────────────────────────────────────────────┤
│ L6 — SKILL / AGENT MARKETPLACE (MCP-native, KYC'd developers)  │
├──────────────────────────────────────────────────────────────┤
│ L5 — IDENTITY-ANCHORED MEMORY (E2EE, Aadhaar-bound, optional)  │
├──────────────────────────────────────────────────────────────┤
│ L4 — POLICY ENGINE + CONSENT LEDGER                            │
├──────────────────────────────────────────────────────────────┤
│ L3 — TOOL LAYER (verified APIs, no raw PII to the model)       │
│      UIDAI auth · DigiLocker · ABHA · Account Aggregator ·     │
│      GSTN · ICEGATE · UPI settlement                           │
├──────────────────────────────────────────────────────────────┤
│ L2 — ADAPTIVE MODEL ROUTER + COMPUTE/STORAGE MESH (DePIN)      │
│      local SLM ↔ KYC'd peer node ↔ cloud LLM                   │
├──────────────────────────────────────────────────────────────┤
│ L1 — OS-LEVEL NODE DAEMON + AOSP/LINUX SUBSTRATE               │
└──────────────────────────────────────────────────────────────┘
```

What each layer does:

- **L8 — Vernacular Generative UI.** Intent in 22 languages (voice, native script,
  or romanized) → on-demand UI materialization. Powered by Bhashini + AI4Bharat.
  When Brain.ai materializes a UI it's in English; when Bharat OS does it, the
  buttons, labels, and confirmations are in Bhojpuri or Tamil or Marathi.
- **L7 — Intent → Decision Orchestrator.** The brain. Parses intent, reasons over
  policy, interprets consent, selects tools, plans multi-step execution. This is
  what turns a "smart UI" into an actual decision engine. (Originated as the
  "UIDAI decision layer" idea — see §7d.)
- **L6 — Skill / Agent Marketplace.** MCP-native, signed, sandboxed, KYC'd
  developers. Skills replace apps; this is the ecosystem network effect.
- **L5 — Identity-Anchored Memory.** E2EE, user-owned, optionally bound to a
  verified Aadhaar attestation. **Pointer, not payload** — memory objects are
  chunk-manifest pointers + summaries, never raw files. Master key in the device
  secure enclave; device pairing via QR / recovery phrase.
- **L4 — Policy Engine + Consent Ledger.** Encodes the Aadhaar Act, DPDP Act,
  sector rules, and per-use-case policies; holds Account Aggregator consent
  artifacts. Every regulated action is checked here.
- **L3 — Tool Layer.** Verified IndiaStack APIs with **no raw PII passed to the
  model**: UIDAI auth (via an AUA/KSA partner), DigiLocker, ABHA, Account
  Aggregator, GSTN, ICEGATE; UPI as the settlement rail.
- **L2 — Adaptive Model Router + Compute/Storage Mesh.** Routes each request to a
  local small model, a nearby KYC'd peer node, or the cloud — by privacy class,
  latency need, and available compute. The mesh is the DePIN substrate: erasure-
  coded encrypted chunks, TEE attestation, fiat-credit settlement.
- **L1 — OS-level Node Daemon + AOSP/Linux.** The daemon is a *system service*
  (not a fighting app): kernel-scheduled, battery/network-aware, WiFi-only by
  default, runs only while charging and above a battery threshold.

The two layers that make Bharat OS more than a UI skin: **L7 + L4** (it can
*decide*, lawfully) and **L2 + L3** (sovereign mesh + sovereign identity, which no
foreign OS can copy).

---

## 7. Layer deep-dives

### 7a. The multilingual reality (L8) — bigger leverage than it looks

You do **not** build the language stack — the Indian government already built it as
a public good:
- **AI4Bharat:** a ~251B-token corpus across 22 languages, ~74.7M prompt-response
  pairs in 20 languages; models like Airavata, IndicBART, IndicBERT.
- **Bhashini (MeitY):** multilingual AI across ~36 text models, ~22 voice models,
  ~35 international languages.
- **IndicTrans2** (translation), **IndicWhisper** (ASR), **IndicTTS** — all
  open-source, MeitY-funded.
- **IndicLID** — language ID for *romanized* Indic text, because most rural users
  type "kya kar rahe ho," not the Devanagari. Romanized input is how Bharat
  actually types.
- Intel + Digital India BHASHINI brought *offline* multilingual capability to AI
  PCs in 2026 — the on-device story is already proven on hardware.

Strategic implication: Brain.ai would need 5–7 years and $50M+ to match what an
Indian builder can pull off the shelf in ~6 months. **What "vernacular UI" must
mean:** (1) voice-first, not text-first — the unlock for sub-literate users;
(2) native script + romanized + voice as equal first-class inputs; (3) code-mixing
tolerance ("Mujhe ek Excel banana hai jisme last quarter ka sales data ho");
(4) generated UI rendered *in* the vernacular, automatically.

### 7b. The compute/storage mesh (L2) — DePIN done right

**Why prior DePINs bled.** Helium and Filecoin have supply-side flywheels with no
genuine demand — most network fees come from people *onboarding hotspots*, not
from a real economy of devices paying to use the network; Filecoin prints tokens
to pay providers, creating perpetual sell pressure. The dirty secret of DePIN:
people run nodes because tokens go up, not because anyone uses the network.

**Why owning the OS fixes mobile DePIN.** Every prior mobile attempt was killed by
the same blockers, and being the OS solves each:

| Blocker | Why others fail | How Bharat OS solves it |
|---|---|---|
| iOS background limits | Apple kills persistent compute | AOSP-only by design |
| Android Doze / battery opt | OS treats node as malware | Scheduler treats node as a system service |
| Carrier data caps | User runs out of quota | WiFi-only by default |
| Battery drain → uninstall | Users blame "the node app" | Runs only while charging + above threshold |
| Trust / verification cost | PoPW expensive on mobile | OS-native TEE attestation (Knox/StrongBox/QSEE) |

**The demand fix (critical, and now standalone).** With sister products explicitly
out of scope, the mesh's demand comes from two intrinsic sources: (1) **the OS
itself as the first tenant** — every device generates inference, memory, app-
generation cache, and agent-state demand; and (2) **Bharat-specific regulated cold
storage** — UPI receipts, GSTN invoices, DigiLocker overflow, ABHA records, all of
which *must* stay in India. This is the strongest standalone argument; it must be
validated early (see §14).

**The engineering, briefly.** Files are chunked, client-side encrypted,
Reed-Solomon erasure-coded (~1.6× overhead for ~4× durability vs naive 3×
replication), distributed across many devices, audited, and auto-reconstructed.
With 95% per-device uptime and a file on ~40 devices, simultaneous total
unavailability is astronomically unlikely. A tiered model keeps it honest:
object/file storage first (phones), an edge-cache tier next, and a high-IOPS tier
only on certified always-on hosts. Fair-use is enforced by a Net Contribution
Score (storage contributed − used) so heavy users subsidize light users — this is
what prevents a Ponzi dynamic. **No tokens** — settlement is fiat-denominated,
prepaid, non-transferable credits on UPI (avoids RBI/SEBI exposure).

### 7c. Identity-anchored memory + the cognitive layer (L5)

Bharat OS is a *second mind*, not a smarter keyboard. The difference from a chatbot
is six concrete missing layers that the OS supplies:
1. **Identity & agency** — persistent identity per user and per agent; can hold
   goals for weeks; can initiate action.
2. **Memory with truth guarantees** — versioned, time-aware, source-linked,
   revocable, auditable ("this value came from source X at 11:42am").
3. **Execution substrate** — workflow engine + scheduler + secrets vault; retries,
   rollbacks, runs while the user is offline.
4. **Permissions & law** — scopes, monetary limits, legal traceability, compliance.
5. **Verification & evidence** — receipts, logs, replay; it can *prove* what it did.
6. **Objective function** — optimizes for the user's goals (cost, risk, time,
   success probability), not "give a good answer."

**Privacy is architecture, not policy.** Five non-negotiables: user-owned encrypted
vault ("stored for you, encrypted for you, useless to us"); capability-based
permissions with limits/expiry/audit; no training on user data ever; local-first
when possible; zero-knowledge servers (they store encrypted blobs and run signed
workflows, nothing more). **Ambient capture rule:** nothing is captured unless the
user explicitly invokes it — store *outcomes* (summaries, decisions, action items;
~10–100KB), not recordings; raw audio/video is never stored by default. **Identity
is one cryptographic identity** (a root keypair that owns the keys, vault, and
permissions, portable across devices) — Aadhaar/email/phone are recovery and
attestation mechanisms, not the identity itself.

### 7d. The decision orchestrator + IndiaStack (L7 + L3/L4)

This is what makes the whole stack defensible. A generic "user-owned crypto
identity" is something Apple/Signal also have. **Aadhaar/IndiaStack gives Bharat OS
government-grade, legally-binding identity for 1.4B people as public
infrastructure** — and the orchestrator reasons over verified identity tokens +
consent artifacts + policy + tools (it is *not* trained on Aadhaar data).

The integration map (without IndiaStack → with it):
- Onboarding: email/password → 30-second Aadhaar offline eKYC, no password.
- Marketplace devs: anonymous → KYC'd (Aadhaar+PAN), liability traceable.
- Memory: generic keypair → keypair bound to a verified Aadhaar attestation.
- Router: routes by compute/privacy → adds **regulatory class** (regulated data →
  only KYC'd nodes).
- Mesh nodes: anonymous (Sybil-prone) → KYC'd operators, UPI payouts, tax-clean.
- Settlement: tokens → UPI rails, RBI-clean.

**Four things this unlocks that nothing else can:** (1) **Sybil-resistant DePIN**
(one human = one node identity); (2) **regulated workflows on a consumer AI OS**
(banking, GST, health, government — natively, in vernacular); (3) **UPI settlement,
not tokens** (the thing that makes it fundable in India, not grey-market);
(4) **Trust Passport** — a portable reputation across mesh, marketplace, and
transactions.

**Regulatory reality (real, solvable, ~3–6 months + ~₹50L–1Cr legal):** AUA/KSA
partnership for online Aadhaar auth (or offline XML eKYC, no licence, for V1);
DPDP Act 2023 compliance from day 1 (consent management, fiduciary registration,
breach protocol); Aadhaar Act §7 → Aadhaar must be *optional* with PAN-only /
DigiLocker-only fallbacks; MeitY data localization (which the thesis wants anyway);
RBI rules on UPI payouts (TDS, KYC, limits); DigiLocker/AA empanelment (2–4 weeks);
ABHA HIU registration (4–8 weeks).

---

## 8. The three differentiators no competitor stacks together

1. **Vernacular-native** — 22 languages from day one; Brain.ai/Apple/Gemini are
   English-first.
2. **DePIN-native at the OS layer** — Helium/Filecoin/Render fight the OS; Bharat
   OS *is* the OS, with closed-loop demand because the OS is its own first tenant.
3. **Sovereign identity via IndiaStack** — UIDAI/UPI/DigiLocker/ABHA/AA; no foreign
   player can access these rails.

The sovereign-data narrative (Indian language data, processed and stored on Indian
devices, governed by Indian law) is genuinely fundable under the IndiaAI Mission
(~₹10,372 Cr / ~$1.25B announced).

---

## 9. Five concrete decision flows (all generic to Bharat OS)

1. **Vernacular regulated onboarding.** An MSME owner speaks in Tamil: "open a
   current account for my exports business." OS verifies Aadhaar, pulls IEC+GSTIN,
   risk-scores on KYC'd peer compute, generates the bank's forms in Tamil+English,
   routes to the bank API.
2. **Auto-eligible scheme delivery.** "Which government schemes am I eligible for?"
   — checks consent, pulls land records (DigiLocker) + income (AA), reasons against
   scheme-policy RAG, generates auto-fill applications, tracks DBT delivery.
3. **Vernacular trade documentation.** "Draft the documents for my shipment." —
   pulls IEC + trade history, screens counterparty against sanctions lists,
   generates the paperwork, routes for approval.
4. **Health-record sovereignty.** "Show me my diabetes history." — pulls ABHA
   records, decrypts on device, reasons in vernacular; the hospital requests
   specific fields with consent (minimum disclosure).
5. **Sovereign AI inference.** A heavy query routes to KYC'd peer compute; results
   return with an audit log of *which Indian devices* served it — cheaper than
   cloud, often faster than a US region, and the data never leaves Indian devices.
6. **Proximity work / labor matching.** A contractor says in Bhojpuri: "I need 100
   laborers for brick-kiln work near Varanasi, three days, ₹X/day." The
   orchestrator structures the post; the system messages — by voice, in their own
   language — registered workers with matching skills who are within the radius and
   marked available, ranked by Trust Passport. Workers accept or decline by voice;
   wages are escrowed on UPI and released on verified completion. This flow is a
   flagship for Bharat OS and surfaces hard design problems — see §9A.

---

## 9A. Deep dive — the work-matching marketplace (and what it forces us to solve)

This is one of the most important flows for Bharat OS because it reaches a
population that ordinary gig apps cannot serve. Apps like the existing labor
platforms assume literacy, an app install, and one personal smartphone per user.
The Indian daily-wage workforce often has none of those. A voice-first, vernacular,
identity-anchored OS is the only shape that fits — which is exactly why this flow
showcases the whole stack.

### How the flow maps to the layers
- **L8 (vernacular voice):** both the requester and the worker interact entirely by
  voice in their own language — the unlock for sub-literate users.
- **L7 (orchestrator):** parses "I need 100 labor near X for 3 days at ₹Y" into a
  structured job (skill type, headcount, geo + radius, dates, wage, duration), then
  plans the match and the notifications.
- **Matching:** filter workers by skill + availability + proximity + a minimum
  Trust Passport score; rank; notify the best-fit set first, widening the radius if
  unfilled.
- **L5 / L4 (identity + consent):** each worker has opted in to be discoverable and
  to share *coarse* location; every contact is logged in the consent ledger (who
  was messaged, for what, when) so the whole thing is auditable.
- **L3 (tools):** UPI **escrow** for wages; an optional Aadhaar-verified tier for
  higher-trust postings and workers.
- **L2 (mesh / routing):** notifications are routed efficiently; proximity matching
  is done **server-side and privacy-preservingly** — the requester sees that a
  worker is "nearby and available," not their exact location.

### Design problem A — shared and absent smartphones
A poor household may share a single phone among the whole family, or have none at
all. The architecture has to bend to this reality, not assume one-phone-one-person.

- **Principle: identity is the person, not the device.** Bharat OS identity is
  already a portable cryptographic keypair (L5), so **multiple profiles on one
  phone is architecturally natural** — each family member holds their own identity,
  switchable on a shared device. A "household" can group several sub-profiles.
- **Per-profile authentication is mandatory.** Switching to a profile requires *that
  person's* auth (a short PIN, a voice match, or an Aadhaar OTP) so one family
  member cannot silently act as another, accept work in their name, or receive
  their wage. Convenience must not become impersonation.
- **The truly device-less** are served through an **assisted / kiosk channel** (a
  Common Service Centre operator or a community device). The hard rule there: the
  operator helps, but cannot *act as* the worker — the worker must personally
  authorize accepting a job and must be the one who receives the wage; consent is
  captured per session and logged.
- **The honest tension:** full per-person end-to-end encryption pulls against
  shared-device convenience. The resolution is layered — per-person identity by
  default, a shared-device mode with lightweight per-profile auth, and a device-less
  assisted channel with strict consent + audit. This is a **P0 design problem**, not
  a solved one (see §14).

### Design problem B — fraud, and protecting the worker
The right framing is not only "fraud against the platform" — it is **protecting
vulnerable people**, because a labor marketplace can amplify real harm if built
carelessly. Vectors and the defenses the architecture already enables:

- **Fake / Sybil profiles** (one person farming many worker accounts, or faking
  demand) → **Aadhaar-anchored identity** (one human = one identity) is the core
  defense — the same §5/§7d unlock. This is the single biggest reason this works on
  Bharat OS and not on an anonymous app.
- **Advance-fee scams targeting workers** ("pay ₹500 to register / to get this
  job") → a hard policy rule in **L4: a worker never pays to find or accept work.**
  Any post or message demanding money from a worker is blocked and flagged.
- **Wage non-payment** → **UPI escrow**: the wage is committed up front and released
  on verified completion — the worker is protected, not asked to trust a stranger.
- **No-shows** (either side) → **Trust Passport** reputation; repeated no-shows
  lower discoverability for that profile.
- **Fake job posts / data harvesting** → requester verification tiers (KYC'd
  posters get reach; unverified posts are rate-limited and capped), anomaly
  detection, and the audit log.
- **The serious harm — exploitation, bonded or child labour, trafficking.** A
  labor-matching system can be abused for these, so it needs genuine safeguards, not
  just anti-fraud logic: minimum-wage-floor checks and labour-law rules encoded in
  the policy engine (L4); age and consent verification; one-tap reporting and
  escalation; and human review for flagged categories. The platform's duty is to
  protect workers, not merely to avoid losses to itself. This is a place to bring in
  labour-law expertise and likely NGO / government partners *before* launch.
- **The accessibility trade-off (don't ignore it).** Verifying everyone hard raises
  onboarding friction for exactly the people we want to reach, and Aadhaar must stay
  optional. So verification is **tiered**: low-trust postings and profiles are
  allowed but limited (smaller radius, lower headcount, escrow-only); higher trust
  and reach require more verification. Sybil-resistance and accessibility have to be
  balanced, deliberately.

---

## 10. Competitive landscape

- **Brain.ai (Natural OS)** — the most credible. Commercial launch in Japan via
  SoftBank (Apr 2026); ~$80M raised; ~100 people; four foundational agent patents
  (filed from 2016). But: US/Japan/Europe focus, English-first, cloud-dependent,
  no IndiaStack, no mesh.
- **AGI Inc.** — $8M, 500K waitlist; a voice-driven **UI-automation scraper** that
  taps buttons in existing apps. Founder admits a reliability ceiling (good under
  ~50 steps; ~1,000+ steps fails often) because it *fights* the apps. US/English,
  no identity layer, explicitly avoids banking. Validates the category; leaves the
  regulated/vernacular wedge wide open.
- **Rabbit / Humane** — same instinct, weaker or failed execution.
- **Apple Intelligence** — on-device only, no peer mesh, will never bind to Aadhaar.

**Why Bharat OS is differentiated:** API-driven execution via a skill marketplace
(not UI scraping) is far more reliable for regulated multi-step workflows; and the
vernacular + IndiaStack + sovereign-mesh stack is structurally un-copyable by any
of them. The category shipping is **validation, not refutation** — and the clock
is running, so the right posture is to move, not to keep comparing.

**OEM distribution is de-risked:** AGI Inc. proved you don't manufacture phones —
you convince an OEM (Samsung/Lava/Micromax/Nothing/Realme) or a telco (Jio most
aligned with sovereignty) to embed the shell as a flashable layer.

---

## 10A. The case in real-world precedent — for and against

Bharat OS is an ambitious bet. The honest way to judge it is against real
companies and real outcomes — not hypotheticals. Both columns below are made of
actual cases; weigh them together.

### For — precedents that say this can work
- **The substrate already exists and works at scale.** Aadhaar (population-scale
  public identity) plus UPI — which processed over 21 billion transactions worth more than ₹28 lakh crore in January 2026 alone —
  plus open APIs are real and adopted. Bharat OS does not have to invent its
  foundation; it assumes one that demonstrably functions.
- **The AI-native OS category is shipping.** Brain.ai's Natural OS launched
  commercially via SoftBank in Japan (§10) — the category is no longer speculative.
- **The India-stack pattern is being exported and adopted.** MOSIP, the open-source
  identity platform from IIIT-Bangalore, is already adopted by twenty countries and has more than 121 million active users;
  India has signed DPI cooperation agreements with 24 countries,
  and the Gates Foundation has committed $200 million over five years to advance DPI,
  backing open tools like MOSIP. The thesis that this pattern travels is empirically
  supported, not aspirational.
- **Citizen super-apps win mass adoption.** Ukraine's Diia delivers identity,
  documents, and government services to citizens through one mobile app at national
  scale — proof an identity-anchored citizen app can be genuinely loved and used.
- **Fast mass onboarding in India is precedented.** Jio onboarded hundreds of
  millions in a few years on a low-cost, India-first play — a real template for the
  OEM/telco distribution path Bharat OS needs.
- **Voice-first vernacular matches real behavior.** Hundreds of millions of
  low-literacy Indians already live in voice notes, WhatsApp, and YouTube in their
  own languages — the L8 wedge fits how people actually behave.
- **Fork-and-shell at scale is normal.** AOSP skins like MIUI ship to hundreds of
  millions — the "build the shell, not the kernel" approach (§4) is well-proven.

### Against — precedents that say be careful
- **DePIN demand-flywheels have failed for real.** Helium and Filecoin built supply
  with thin genuine demand; this is the single biggest risk to the mesh (§7b, §14),
  and it is a real-world failure, not a theoretical worry.
- **Aadhaar itself has a hard side.** Biometric-authentication failures have caused
  real exclusion from rations and benefits, and the program has drawn privacy
  litigation and data-leak controversy. This is precisely why the doc keeps Aadhaar
  *optional* (§15) — but the cautionary record is real and politically charged.
- **AI-native hardware/OS has flopped before.** Rabbit R1 and Humane's AI Pin were
  the same instinct as the generative-UI ambition and stumbled badly on reliability
  — a direct warning for L8.
- **New OSes die on ecosystem and distribution.** Windows Phone (with ~$10B behind
  it), Firefox OS, and others died despite money and talent (§4). Underestimating
  these moats is the classic killer.
- **The platform giants can move into the wedge.** Google and Apple control the
  device base and are taking their assistants multilingual in India; they can copy
  "vernacular + on-device AI" faster than a startup can build distribution. The
  window is real but not wide.
- **Well-funded Indian rivals already contest it.** Sarvam, Krutrim and others are
  building Indian-language AI — "vernacular-native" is an advantage, not a monopoly.
- **Sovereign-ID programs face legal and civil-society backlash.** Kenya's Huduma
  Namba was struck down in court; Worldcoin's biometric model has been banned or
  investigated in several countries. Anchoring a consumer OS to sovereign biometric
  identity invites the same scrutiny.
- **Regulatory hostility is real.** RBI's posture on tokens constrains the
  settlement design (hence fiat credits, §15), and DePIN sits in a legal grey zone.

### The honest read
The "for" column says the substrate, the category, and the export wave are all
real — the bet is not crazy. The "against" column says the two things most likely
to kill it are demand-side mesh economics (Helium's grave) and the platform/
regulatory environment — not the technology. Believe both columns at once.

---

## 11. Feasibility verdict

- **Feasible:** an AI-native OS *shell* on AOSP — vernacular-first, sovereign,
  mesh-native — with a sharp wedge. Proven by Brain.ai's launch, ChromeOS/SteamOS/
  every Android skin, and v0/Bolt-class generative UI.
- **Not feasible:** writing your own kernel; self-coding drivers from hardware;
  running on iOS; replacing Windows/macOS/Android at the kernel layer. None of
  these are blocked by AI capability — they're blocked by certification,
  distribution, ecosystem, and 30 years of driver code.
- **The honest scope:** the technology is feasible; the constraint is focus and
  funding. This is a funded-team, multi-year company (see §12) — not a solo or
  single-sprint build, and this doc will not pretend otherwise.

---

## 12. Build reality

- **Team:** ~5–8 senior engineers minimum — distributed systems (DePIN protocol,
  proof-of-work), AOSP/kernel (node daemon, scheduler), ML systems (inference
  routing, quantized models), cryptography (TEE/attestation) — plus founder as
  architect/fundraiser/GTM.
- **Capital:** ₹3–8 Cr ($3–8M) seed; IndiaAI Mission grants + a sovereign-tech VC
  (Peak XV India, Lightspeed India, Premji) are the natural pools.
- **Timeline:** ~24 months to a flashable ROM + reference-partner deployment.
- **Hard parts:** TEE-backed attestation (~6–9 months for a credible MVP);
  verification-of-work on mobile is the genuinely hard problem.
- **Partners:** an OEM or telco is required for distribution beyond early adopters.
- **Regulatory:** ~3–6 months and ~₹50L–1Cr of legal/compliance before a regulated
  V1 (AUA partnership, DPDP, AA/ABHA empanelment).
- **Constraints:** iOS out forever; RBI hostile to tokens (→ fiat credits only);
  data localization required.

---

## 13. Phased roadmap (independent — no portfolio dependencies)

- **Phase 0 (months 0–6): protocol + identity, no OS yet.** Ship the compute/
  storage mesh as a standalone protocol + reference Android app. Aadhaar offline
  eKYC (no AUA licence). UPI payouts. DPDP-compliant control plane. Prove the mesh
  works on real Indian phones. Demand bootstrap = the app's own usage + regulated
  cold storage. **Do not rely on any sister product for demand.**
- **Phase 1 (months 6–12): the decision layer.** L4 (policy/consent) + L7
  (orchestrator) on top of the mesh, with the IndiaStack tool layer wired. Trust
  Passport v1. First regulated flows in two languages.
- **Phase 2 (months 12–24): the AI-OS shell as a flashable ROM.** L8 vernacular
  generative UI, L6 MCP skill marketplace, AUA partnership for online auth.
- **Phase 3 (month 24+): open the marketplace and the mesh** to third-party
  developers; explore export to other IndiaStack-adopting countries (Sri Lanka's
  SLUDI, Philippines' PhilSys, Morocco's CNIE).

---

## 13A. Revenue model

**The governing principle: monetize the demand side and the infrastructure — never
the vulnerable end user.** The citizen, the worker, the sub-literate first-time user
is always free. Revenue comes from businesses that want to reach them, developers
who build on the platform, and the margin on compute/storage the network already
produces. This is not just an ethics stance (it honours the §15 "users never pay"
constant) — it is the growth strategy: free for the masses is what builds the
two-sided network that everything else monetizes.

The streams, strongest first:

1. **Compute & storage mesh spread (the core, usage-scaling line).** The platform
   sets a sell price for inference and storage and pays device operators a portion;
   it keeps the spread. Illustratively, storage sold at roughly ₹150–200/TB/month
   with operator payouts of ₹60–80; inference billed per workload with the operator
   paid a fraction. Margin scales directly with usage at near-zero marginal infra
   cost (users own the hardware). It is the AWS economic model without the capex —
   **detailed pricing, the AWS comparison, the fair-use lever, an illustrative
   maturity model, and the honest limits are in §13B.**

2. **Skill / agent marketplace take rate.** An app-store model — a cut (≈15–30%) on
   paid skills and on transactions that skills facilitate. Network-effect revenue
   that compounds as the KYC'd developer ecosystem grows (L6).

3. **Demand-side transaction fees (businesses pay, users don't).** The labor flow
   (§9A) is the template: the *contractor/employer* pays — a per-post fee, a bulk-
   hiring subscription, or a small percentage of the escrowed wage — while the
   worker pays nothing. Generalizes to any business reaching users through Bharat
   OS (merchants, lenders, service providers): pay per successful match, lead, or
   completed transaction.

4. **B2B verified-workflow fees.** Banks, NBFCs, and insurers pay per *completed*
   regulated action routed through the OS — verified onboarding, AA-based income
   verification, e-Sign — all consent-bound. The citizen completing the flow is
   free; the institution that gains a verified customer pays.

5. **OEM / telco licensing & service rev-share.** Device makers and telcos who ship
   the Bharat OS shell pay a licensing fee and/or share service revenue. (IndiaAI
   Mission grants are non-dilutive *capital*, not revenue — see §12 — but they fund
   the pre-revenue phases.)

6. **Business "Pro" tiers.** Paid tiers for businesses and power-users — analytics,
   priority matching, higher posting limits, bulk tools. The consumer tier stays
   free, always.

7. **Trust-as-a-service (cautious, consent-bound).** With explicit user consent, a
   business can request a verified attestation or a Trust Passport signal and pay
   for it. This is *attestation*, never data sale (see guardrails). Smallest and
   most carefully gated of the streams.

**What we never monetize (guardrails):**
- Never charge the citizen/worker/end-user for access — binding (§15).
- **Never sell user data.** The zero-knowledge architecture and DPDP forbid it, and
  it is the antithesis of a "sovereign, user-owned" OS. Verification is consent-
  bound attestation, not data brokerage.
- No exploitative ads or dark patterns aimed at vulnerable users.
- No tokens or speculative crypto economics (settlement is fiat credits on UPI).

**Timing — be honest about it.** This is a build-the-network-then-monetize play.
Phases 0–1 are essentially pre-revenue and grant/seed-funded — the mesh and the
marketplace each need *both* sides before they earn. Demand-side and marketplace
fees begin in Phase 2; the mesh spread and marketplace network effects become the
durable engine in Phase 3. Do not model meaningful revenue before the two-sided
network reaches critical mass.

---

## 13B. The mesh as a "decentralized AWS" — economics in detail

This is the core revenue engine and the most novel, so it earns a full treatment.
The pitch is "AWS economics without the capex" — but be precise about what that
means: the mesh is a **cost-advantaged complementary tier for the workloads that
fit**, not a drop-in hyperscaler replacement (see the limits at the end).

### The three-party model
- **Workload owners (demand)** prepay credits to run storage or inference.
- **Device operators (supply)** earn credits *only when their idle capacity
  actually serves traffic* — and only while charging, on WiFi, above a battery
  threshold. This **pay-only-when-used** rule is the difference from Helium/
  Filecoin: no idle subsidy, no token inflation, earning is tied to real service.
- **The platform** runs the control plane (identity, routing, metadata, billing,
  TEE attestation), sets prices, and keeps the spread. Settlement is fiat credits
  on UPI.

### Product 1 — storage
| | per TB / month |
|---|---|
| AWS S3-class reference (India) | ₹2,000–2,500 |
| Mesh **sell price** | ₹150–200 |
| Operator **payout** | ₹60–80 |
| Platform **gross spread** | ₹80–120 |

Out of that spread the platform still bears: bandwidth/egress it carries, the
control-plane infra, support, and audit/fraud. Net margin is the spread minus
those. One honest adjustment: erasure coding adds ~1.6× raw overhead, so the
platform places ~1.6 TB of *raw* capacity to sell 1 TB of *usable* storage —
payouts scale on raw stored, sell price on usable. Build that into the model.

### Product 2 — compute / inference (the bigger, more novel line)
Idle device NPUs/GPUs during charging hours are near-zero marginal cost to the
operator. Inference is billed per workload (per ~1k tokens, or per job), sold below
cloud GPU pricing while still paying operators meaningfully; the platform keeps the
spread. **Reality check:** device compute is weak and intermittent, only small or
quantized models run on-device, and heavy workloads still route to the cloud. The
mesh captures the *routable fraction* — light/medium inference, caching, and batch
jobs — not all inference. Model it as a slice, not the whole pie.

### Why the unit economics beat AWS
| Cost line | AWS / centralized | Bharat OS mesh |
|---|---|---|
| Capex (servers/GPUs) | very high | ≈ zero — users own the hardware |
| Power | operator pays | user pays (already) |
| Internet | operator pays | user pays — WiFi (already) |
| Idle capacity | operator burns it | zero — pay-only-when-used |
| Land / datacenter | required | none |

That cost structure is *why* the mesh can sell at a fraction of AWS and still pay
operators and keep margin. The platform monetizes a network it didn't have to build.

### The fair-use lever (a product mechanic that is also revenue)
Every user has a **Net Contribution Score (NCS) = capacity contributed −
consumed.** NCS ≥ 0 → *producer* (free service + earning). NCS < 0 → *consumer*
(pays). A progressive curve on net consumption (illustrative): 0–50 GB free,
50–200 GB at ₹2/GB, 200 GB–1 TB at ₹1.5/GB, >1 TB at ₹1/GB. This is what makes
"free for the masses" sustainable — light contributors ride free; heavy consumers
cross-subsidize them. Same logic as telecom "unlimited" plans and airline
overbooking, and it prevents Ponzi dynamics because earning is tied to service
rendered, never to token speculation.

### Illustrative model at maturity (a ceiling, NOT a forecast)
Clearly labelled as the *shape* of the economics at scale, assuming the two-sided
network already works:
- **Storage:** 100M users, ~20 GB avg contributed, 25% of capacity rented at
  ₹200/TB/mo with ₹80/TB payouts → revenue ~₹600 Cr/yr, payouts ~₹240 Cr,
  infra+staff ~₹220 Cr → **net ~₹140 Cr/yr.**
- **Compute:** 5% of users monetizing at ~₹300/mo → GMV ~₹1,800 Cr/yr, ~30%
  retained → **~₹540 Cr/yr.**
- **Combined illustrative net ~₹680 Cr/yr** — from a company with no datacenters,
  GPUs, land, or power bills.

Treat these as an order-of-magnitude illustration of the model, not a projection.
Early-stage revenue is effectively zero until the network reaches critical mass
(see §13A timing).

### The honest limits of the "AWS" analogy
- **Not a drop-in replacement.** Devices churn, so latency and availability vary —
  unsuitable for hot, transactional, or SLA-critical workloads.
- **It's tiered:** object/cold storage and caching on phones; high-IOPS only on
  certified always-on hosts; batch and light inference, not real-time heavy compute.
- **Bandwidth:** Indian mobile data is capped and asymmetric, so node traffic is
  WiFi-only, which constrains egress economics.
- **Verification cost:** TEE attestation to stop operators lying about work done is
  real engineering and eats into margin.
- **Position accordingly:** a cost-advantaged complementary tier for the fraction
  of workloads that fit — anchored first by Bharat OS's *own* demand (the OS as
  first tenant) and regulated cold storage — not "we replace AWS."

---

## 13C. Beyond India — porting the model to other digital-identity nations

The architecture is not India-specific in principle. It is specific to a *pattern
of preconditions*. Where those preconditions co-occur, the whole model ports
cleanly; where they don't, it doesn't — no matter how rich or "advanced" the
country is. India-first always; export is a Phase 3+ question and never a
substitute for winning the home market.

### The four-condition portability test
The model needs four things to co-occur in a country:
1. **A public/national digital identity with an authentication API** — not just an
   ID *number*, but something an app can verify a person against (the L3/L7 anchor).
2. **An instant, low-cost payment rail** — for the no-token, UPI-style settlement
   the mesh and marketplace depend on.
3. **An Android-dominant device base** — because the OS is AOSP-only by binding
   constant; iOS is out.
4. **A large, underserved, multilingual population** — the vernacular wedge and the
   demand for cheap sovereign compute/storage.

All four → strong fit. Two or three → partial; adapt or wait. Weak identity +
iOS-heavy + rich, already-served population → poor fit.

### Strong fit — the Global South / DPI-adopting nations
This is the natural export path, and the rails are already being laid by India
itself. The Modular Open-Source Identity Platform (MOSIP), born at IIIT-Bangalore,
is already adopted by twenty countries with more than 121 million active users;
India has signed DPI cooperation agreements with 24 countries,
concentrated in the Caribbean, Southeast Asia, Africa, and Latin America;
and UPI is now live in more than eight countries including the UAE, Singapore, Nepal, Sri Lanka, France, and Mauritius.
The Philippines was the first large-scale MOSIP case — about 76 million of its 110 million citizens have been issued digital IDs through PhilSys —
and deployments are live or building in Ethiopia, Togo, Zambia, Sri Lanka, and
Morocco (MOSIP's 2026 community conference was held in Rabat). These countries are
Android-dominant, multilingual, with large underserved populations adopting public
identity plus instant payments. **The real international thesis is not "expand to
the West" — it is to ride India's DPI diplomacy into the Global South**, building
Bharat OS on MOSIP-compatible identity and UPI-compatible rails so it follows the
wave rather than fighting it.

### Partial fit — the EU (identity yes, the rest no)
The EU is rolling out the EU Digital Identity Wallet: every member state must offer at least one wallet by 24 December 2026,
built privacy-by-design with selective disclosure, free to citizens and voluntary to use, targeting 80% adoption by 2030.
So condition 1 (a strong, standardized digital identity) is arriving. But the other
three fail: the EU is wealthy and already-served (no underserved-masses wedge), iOS
share is high (the AOSP-only mesh forfeits a big slice of devices), GDPR makes a
peer-to-peer data mesh legally heavy, and instant-payment rails are fragmented.
**Verdict: sell the decision/identity layer (L3/L4/L7) as a product onto the EUDI
Wallet — not the whole OS.** The mesh-plus-vernacular-masses thesis doesn't transfer.

### Poor fit — the United States (the SSN case)
This is the case to be most clear-eyed about, and it's a poor fit — not because the
US is hard, but because the model's preconditions are largely absent:
- **SSN is not a digital identity.** It is a static identifier with no
  authentication API, widely leaked, never designed as a login mechanism. The US has
  no centralized national digital ID, and adoption has lagged precisely because
  there is no central system and states must drive their own programs.
- **Identity is emerging but fragmented.** Mobile driver's licenses are rolling out
  state-by-state — by 2026 over 100 million Americans are expected to hold one, embedded in Apple, Google, and Samsung wallets,
  and login.gov is set to accept mDLs for federal services around March 2026.
  But it is state-by-state with no single national wallet, voluntary, and routed
  through the existing platform giants' wallets — the *opposite* of a sovereign
  public stack an independent OS could anchor to.
- **iOS is roughly half the device base.** An AOSP-only OS forfeits half the US
  market on day one.
- **No consumer UPI equivalent, cheap centralized cloud, mature gig/labor apps.**
  The cost-arbitrage and underserved-wedge arguments evaporate.
- **Cultural/political resistance to a national ID** is real and longstanding.

**Verdict: the Bharat OS moat — sovereign public identity + instant rails + Android
dominance + vernacular underserved masses — does not map onto the US.** The only
transferable piece is the AI decision/skill layer as software on top of whatever
identity exists, which is a different, un-moated product competing head-on with
Apple and Google on their home turf. Don't port Bharat OS to the US.

### Portability scorecard (illustrative)
| Country | Public digital ID + auth | Instant payment rail | Android-dominant | Underserved / multilingual | Fit |
|---|---|---|---|---|---|
| India | ✅ Aadhaar | ✅ UPI | ✅ ~95% | ✅ | **Home** |
| Philippines | ✅ PhilSys (MOSIP) | ◐ growing | ✅ | ✅ | **Strong** |
| Ethiopia / Togo / Zambia | ✅ MOSIP-based | ◐ building | ✅ | ✅ | **Strong (early)** |
| Indonesia / Nigeria | ✅ national ID | ◐ / ✅ | ✅ | ✅ | **Strong** |
| EU (27) | ✅ EUDI Wallet (2026) | ◐ fragmented | ✗ iOS-heavy | ✗ | **Partial — sell decision layer** |
| USA | ✗ SSN / fragmented mDL | ✗ no UPI-equivalent | ✗ ~50% iOS | ✗ | **Poor** |

### The strategic rule
India-first, always. Export is a Phase 3+ move and only into strong-fit markets,
ideally along the MOSIP/UPI rails India is already laying. International expansion
must never become the avoidance-of-the-home-market trap, and never dilutes the §0
independence statement or the §15 constants.

---

## 14. Risks & open questions

- **Demand bootstrap (P0).** With sister products out of scope, the mesh must be
  fed by the OS's own usage + regulated cold storage. Strongest standalone
  argument — but a mesh with supply and no demand is the Helium/Filecoin death
  spiral. Validate first-1000-nodes demand early; treat as unsolved until proven.
- **Distribution dependency.** Without an OEM/telco partner this is a dev toy. Line
  one up before Phase 2.
- **Shared & absent devices (P0).** Identity must be person-anchored, not device-
  anchored. Shared-device multi-profile (with per-profile auth) and a device-less
  assisted/kiosk channel are required for the target population — and both raise
  impersonation and consent risks that must be solved before launch (see §9A).
- **Worker / user protection.** Real-world marketplaces (e.g. labor matching) can
  amplify advance-fee scams, wage theft, and even exploitation or trafficking.
  Protecting vulnerable users — not just preventing platform losses — is a design
  requirement; bring in labour-law expertise and likely NGO/government partners.
- **Aadhaar politics.** Mandatory Aadhaar invites §7 litigation and reputational
  harm. Optional-by-design is non-negotiable.
- **"Just add AI" competition.** Signzy/IDfy/Karza can bolt LLMs onto existing KYC
  stacks. The durable moat is OS-level integration + the marketplace network
  effect — not infrastructure ownership alone (~18-month head start to defend).
- **Scope honesty.** A 24-month funded-team company. Any plan assuming a solo
  single-quarter ship is mis-scoped.

---

## 15. Design constants (binding rules)

- The eight layers (§6) are the canonical architecture.
- **Pointer, not payload** — control plane holds metadata; the mesh holds encrypted
  chunks; the operator cannot read user data.
- **Aadhaar is optional, never mandatory** — fallbacks must work.
- **Identity is the person, not the device** — multiple profiles per phone, each
  with its own auth; one identity portable across devices.
- **Workers/users never pay to access work or services** — no advance fees, ever.
- **Monetize businesses, developers, and the infrastructure spread — never the
  citizen/worker; never sell user data.**
- **No tokens** — fiat-denominated, non-transferable credits on UPI.
- **iOS is permanently out of scope** — AOSP-only.
- **Independence** — never linked to GSOS, OmniQuant, SIP, or Moneytrail (§0).

---

## 16. How to use this document

- This is the **canonical Bharat OS reference**. §0 (independence), §6
  (architecture), and §15 (constants) are binding.
- It is **separate** from any Saarthi repo `CLAUDE.md`. Do not merge them; do not
  let either redefine the other.
- If a future decision changes any constant here, update this file — don't fork the
  context into a new doc.
