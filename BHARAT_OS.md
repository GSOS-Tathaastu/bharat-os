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
│ L6 — SKILL MARKETPLACE (MCP) + SERVICE MARKETPLACE (§9B native)│
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
- **L6 — Skill / Agent Marketplace + Service Marketplace.** Two things live
  here, both Bharat OS-owned. (1) Skill marketplace — MCP-native, signed,
  sandboxed, KYC'd developers; skills replace apps. (2) Service marketplace —
  the native L6 substrate for booking real-world services (cabs, hotels,
  tickets, food, groceries, professional services); see §9B for the
  substrate-ownership principle and the role of the ONDC bridge. The skill
  marketplace replaces the app store; the service marketplace replaces the
  aggregator. Both are the ecosystem network effect.
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

**Phone migration / device pairing — designed in, not yet built.** Because
identity is the person and not the device (§15), switching phones must be
a first-class flow:

1. **Pair new device.** New phone scans a QR shown by the old phone.
2. **Encrypted transfer over local WiFi or Bluetooth.** Identity root
   keypair, L5 encrypted memory vault, consent artifacts, Trust Passport
   evidence, mesh-operator NCS history, and skill marketplace receipts
   all move device-to-device. No cloud round-trip; nothing crosses an
   unauthenticated server.
3. **Recovery phrase fallback.** A BIP-39-style 12 / 24-word recovery
   phrase is generated at identity creation and shown to the user once;
   storing it is the user's responsibility. Required only when the old
   phone is lost / broken / unavailable for pairing.
4. **Multi-device coexistence (optional).** A user can pair the same
   identity across two devices (phone + tablet, or personal + work) with
   independent per-device session keys. Loss of one device revokes only
   that device's session.
5. **What does NOT carry over automatically.** Platform-bound regulator
   tokens (DigiLocker, AA, ABHA bind to device fingerprints by their
   issuers' design) need re-authentication on the new device through the
   normal IndiaStack auth flow. This is regulatory, not architectural.

The structural advantage this creates: Bharat OS portability works
*across OEMs*, because the identity is the substrate. Apple's iCloud
restore requires an Apple device + Apple ID; Google's restore requires a
Google account; Bharat OS's restore requires only the user's own
cryptographic identity. No platform lock-in.

**Status (§17).** Device pairing and the recovery-phrase flow are
unbuilt today; this is a Phase 1 gap the §17 status section flags
explicitly under L5.

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

### 7e. The Adaptive Model Router (L2) — local SLM, peer compute, cloud

§6 commits the OS to a model router that picks per request between a local
small language model on the device, a KYC'd peer node on the mesh, and a
frontier model in the cloud. §5 calls model routing one of the "real, not
fantasy" components of generative computing. This subsection makes that
commitment concrete: why the router exists, what runs where, and what the
trade-offs are.

#### Why this matters — neither Brain.ai nor Apple can do it
- **Brain.ai's Natural OS is structurally cloud-only.** Intent goes to their
  US cloud; UI comes back. That is why it works on a thin SoftBank Android —
  the device is doing very little. The on-device privacy story is whatever
  the cloud says it is.
- **Apple Intelligence is structurally on-device-only** (with a private-cloud
  fallback under tight constraints). High floor, low ceiling: it cannot
  reach for a 400B-class model when an intent needs it.
- **Bharat OS routes per request.** Neither incumbent can copy this without
  rebuilding their architecture, because both *chose once* at the platform
  level. Routing is the OS-level lever that lets Bharat OS keep regulated
  workflows local while still reaching for cloud quality on the long tail.

#### The three tiers
1. **Local SLM on the device (L2 / L8 boundary).** Small language model
   resident on the phone — ~1–7B parameters, 4-bit quantized,
   ~1.5–4GB on disk. Handles vernacular intent parsing (L8), short-context
   reasoning, on-device memory recall and summaries, deterministic tool
   selection for the canonical action types, redaction of PII before
   anything escalates.
2. **KYC'd peer node on the mesh (L2).** A nearby device with spare capacity
   and a TEE attestation, paid in fiat credits via UPI (§7b, §13B). Handles
   medium-complexity reasoning that the local SLM cannot — multi-step plans
   for unfamiliar intents, longer-context summarization, batch inference —
   without leaving Indian devices. The mesh's regulatory class (§7d) makes
   sure regulated data never crosses an unverified peer.
3. **Cloud frontier model (L2 escape hatch).** A hosted frontier model
   (whichever provider; not exclusive) for the long tail: rare languages
   under-represented in the SLM, complex multi-document reasoning, novel
   tool plans, anything where SLM quality is structurally inadequate. Used
   sparingly; never for regulated data without explicit consent (L4); the
   audit ledger records every cloud escalation.

#### Local SLM capability catalog — what works on-device today

A 1–7B parameter SLM, 4-bit quantized, on a 2023+ phone NPU is more capable
than the "thin client" framing suggests. The capability profile is
sharp-edged, not flat — here is what is in-scope on-device and what is not.

**Strong on-device capabilities (no escalation needed):**
1. **Voice ↔ text in 22 Indian languages.** IndicWhisper (ASR) + IndicTTS
   (TTS) run real-time on-device. The full L8 voice loop closes without a
   network round-trip.
2. **Intent parsing and classification** for the canonical action types
   (regulated onboarding, scheme delivery, health, labor, service booking,
   mesh storage). Reliability ~90–95% on trained domains; handles
   code-mixed input ("Mujhe ek cab book karo").
3. **Named entity extraction** — PANs, Aadhaars, amounts, dates, locations,
   names — for auto-filling regulated forms.
4. **PII redaction before escalation.** Sensitive tokens are stripped
   on-device before anything routes to a peer or the cloud. This is what
   makes the §7e privacy story real, not aspirational.
5. **Indic ↔ Indic and Indic ↔ English translation** via IndicTrans2 — good
   enough for conversational and short-document use.
6. **Short summarization** (1–4 K tokens in → 1–3 sentence out): WhatsApp
   threads, notifications, single-page documents.
7. **Q&A over L5 encrypted memory.** *"When did I last book a doctor?",
   "What was my last electricity bill?"* — the SLM reasons over the user's
   own memory chunks; the data never crosses the device boundary.
8. **Calendar / date parsing across languages.** *"अगले मंगलवार",
   "after Diwali", "Friday raat"* → ISO timestamps.
9. **Vernacular response generation.** Template filling in the user's
   language; Phase 1.37 `localizeResponse` is the seam this plugs into.
10. **Tool calling for ~10 well-defined tools.** Choosing between the
    canonical action types reliably. Degrades sharply past ~20 tools.
11. **Short conversational continuity** (3–5 turn context). Enough for
    "yes confirm / show other options / how much was that."
12. **Spelling and romanized-Indic typo correction** before the orchestrator
    sees the text.

**Capability by model tier:**

| Tier | Models | Hardware floor | What it adds beyond the tier below |
|---|---|---|---|
| 1–2B | Llama 3.2 1B, Gemma 2 2B | Most 2022+ phones, even mid-range | Voice loop, NER, translation, basic intent classification |
| 3–4B | Phi-3.5-mini, Llama 3.2 3B | Snapdragon 7-series, Tensor G2+ | Reasonable tool calling, 3–5 step conversational reasoning |
| 7B | Sarvam-1, AI4Bharat-tuned | Snapdragon 8 Gen 2+, Tensor G3+, Dimensity 9000+ | Proper Indic conversational quality, multi-turn, complex form-filling sessions |

**Escalation thresholds — what the SLM cannot do alone:**
- Multi-step planning beyond ~5 steps → escalate to KYC'd peer
- Long-context document analysis (>4–8 K tokens) → peer or cloud
- Cross-document synthesis (multiple PDFs) → cloud
- Reliable tool calling against 20+ tools → peer or cloud
- Reasoning about novel domains absent from the SLM's training → cloud
- Code generation, complex math, image / video understanding → cloud

**Where this shows up in §9C vignettes.** Almost every user-facing vignette
runs through the on-device SLM: Sita's Hindi loan conversation (1),
Lakshmi's Tamil ABHA query (3), Suresh's Bhojpuri job-ping (5), the
shared-phone voice biometric (6), Anjali's *"cab book karo"* intent (10),
the Tamil-Malayalam hotel flow (11), Priya's NPU is what *serves* these
same workloads to other users at night (7), and the conference-batch case
(16) is on-device SLM at scale across many operator devices. The two
vignettes that do *not* lean on the SLM are 9 (Rajesh's storage — pure L2)
and 13 (Lava OEM — distribution-layer commercial).

#### Capability-tiered distribution — Lite / Standard / Pro

Brain.ai ships one binary. Apple gates Intelligence by hardware (iPhone 15
Pro+). Bharat OS does better because it has the §7e router as a
compensating mechanism: ship the *same OS* in three model-pack SKUs sized
to the device, and let the router smooth the experience.

| SKU | Target device | Local SLM | On-disk footprint | Routing posture |
|---|---|---|---|---|
| **Bharat OS Lite** | Entry-level (₹6–10K, Lava / Itel / sub-Snapdragon 6-gen) | 1–2B (Llama 3.2 1B or Gemma 2 2B) | ~0.8–1.2 GB | Heavy escalation to mesh peers and cloud |
| **Bharat OS Standard** | Mid-range (₹10–25K, Snapdragon 7-series, Tensor G2/G3) | 3–4B (Phi-3.5-mini or Llama 3.2 3B) | ~1.8–2.2 GB | Balanced: most flows local; some peer escalation |
| **Bharat OS Pro** | Flagship (₹25K+, Snapdragon 8 Gen 2+, Tensor G3+, Dimensity 9000+) | 7B (Sarvam-1 or AI4Bharat-tuned) | ~3.5–4.2 GB | Mostly local; peer/cloud only for genuinely heavy tasks |

The point is **a worker on a ₹7K Lava feels the same OS as a flagship
Pixel owner.** The router compensates for the SLM gap by escalating Lite
users more often to KYC'd mesh peers and the cloud — and the §13B Net
Contribution Score fair-use lever means Lite users (net consumers) are
cross-subsidized by Standard/Pro users (net producers). This is what
"sovereign OS for 1.4 B people" actually requires; a single-binary OS
gated by hardware floor (Apple's approach) excludes the people Bharat OS
exists for.

#### Candidate local SLMs (2026 landscape)
- **AI4Bharat / Sarvam-1 (~7B)** — India-specific, strong on the 22 Indian
  languages thanks to the ~251B-token AI4Bharat corpus (§7a). The natural
  default for L8 intent parsing in vernacular contexts.
- **Phi-3.5-mini (3.8B), Gemma 2 (2B), Llama 3.2 (1B / 3B)** — general
  small models. 4-bit quantization gets them to 1.5–2GB on disk and
  runnable on Snapdragon 8 Gen 2+, Tensor G3+, Dimensity 9000+ — i.e.,
  most phones shipped in or after 2023.
- **Bhashini / IndicWhisper / IndicTTS** — already proven on-device for
  ASR / TTS (Intel + Digital India shipped these on AI PCs in 2026). The
  voice loop does not need an LLM at all.

#### How the router decides
The router runs four checks per request and picks the lowest tier that
clears all of them:
- **Privacy class.** Regulated or PII-tagged intent → never cloud without
  explicit consent. Default to local; escalate to a KYC'd peer with a TEE
  attestation if the local SLM is inadequate.
- **Latency budget.** The L8 voice loop needs sub-300ms turnaround; that
  rules out cloud for interactive intents on weak networks.
- **Compute availability.** Battery threshold, NPU presence, current
  device load. A 2021 phone without an NPU routes more aggressively to the
  mesh; a charging Pixel 9 keeps almost everything local.
- **Network class.** WiFi → mesh / cloud are cheap; mobile data → local
  preferred to spare the user's data cap.

#### On-device SLM — the real trade-off table

| Pro | Con |
|---|---|
| Privacy by construction (DPDP compliance trivial) | Quality ceiling at 1–7B parameters |
| Sub-100ms latency | 1.5–4GB on-disk model weights |
| Offline-capable (rural-India unlock) | 2–4GB RAM resident during inference |
| Zero per-query cost | Battery drain — needs the same charging-only guardrail as the mesh node (§7b) |
| Sovereignty without policy enforcement | Sustained inference heats mid-range phones |
| No cloud-vendor lock-in | Pre-2022 phones often lack a usable NPU |
| Composable with mesh peer compute | Small models are less reliable at structured tool calls |
| Model is portable (not held hostage by an API) | Model updates are multi-GB OTAs vs. instant cloud updates |

The honest read: on-device alone is not enough for everything, and cloud
alone is not acceptable for sovereignty. Routing is the only architecture
that gives both — which is why §6 makes it L2 (substrate-level), not an L7
feature.

#### What's built today
Nothing on this seam yet. §17 already flags it: the L7 orchestrator is
deterministic rule-and-alias normalization, and the L2 mesh is a placement
simulator. The router itself, a packaged on-device SLM, the TEE-attested
peer compute pool, and the cloud escape hatch are all unbuilt. The §7a
vernacular module and the §7d orchestrator are the seams the router will
plug into.

---

### 7f. The mesh as a federated training substrate — compatible with §15, not contradictory

§15 binds *"no training on user data, ever; zero-knowledge servers."* That
forbids silent harvesting — the OpenAI / Google default. It does **not**
forbid the architectures that improve models *with* user consent and
without their data ever leaving the device. Done right, the §7b / §7e mesh
becomes a **training substrate** in addition to an inference substrate —
and turns Bharat OS's massive future device footprint into a model-quality
flywheel without breaking any binding.

#### Three model-improvement paths Bharat OS can use

1. **Federated learning over the mesh.** The model trains on-device using
   the user's own data; only encrypted gradient updates (with differential
   privacy noise) leave the device. The control plane aggregates updates
   across thousands of devices to produce a better global model. Raw user
   data never moves. Gboard and Apple Intelligence already use this; the
   novelty for Bharat OS is doing it over a *KYC'd, fiat-credit-paid mesh*
   rather than a closed vendor cloud. The same operator node that serves
   §13B inference at night can participate in a federated training round
   the next night, paid the same way.

2. **Opt-in explicit data donation.** The user voluntarily contributes a
   data chunk (anonymized, redacted) to public-good model training, with
   per-chunk consent in the L4 ledger and full revocation. They earn UPI
   credits for participating. Brand differentiator: *"you say yes, you
   get paid"* — the precise opposite of the silent-harvest default.

3. **Public-good corpus contribution.** Bharat OS funds or contributes to
   AI4Bharat / Bhashini corpus expansion (already public-good
   infrastructure, §7a). No private data; aligns with the §7d sovereign-DPI
   thesis. Strengthens the public-good Indic model commons that Bharat OS
   itself depends on.

4. **RLHF on explicit user feedback.** When a user explicitly rates a
   response (👍 / 👎, "this was wrong, here's what I meant"), that is
   allowed training signal because the user is the one providing it.

#### What stays explicitly forbidden
- Silent use of on-device intent / memory / document-extraction signals
  for training, even anonymized, even aggregated. §15 binding.
- Training on the contents of L5 encrypted memory under any circumstance,
  including for the user's own benefit. The memory vault is read-only to
  the user, never to a model trainer.
- Selling user data, or selling training-set access, to anyone. §13A
  guardrails.
- Inferring a training-signal opt-in from a user's general consent. Each
  donation chunk needs its own L4 consent artifact.

#### Why this is a strategic asset, not just a constraint
A federated training mesh at Bharat OS scale (target Phase 3+: tens of
millions of devices) produces something no closed vendor can match: an
**India-specific model improvement loop that runs on the user's terms.**
The privacy story is the marketing story; the marketing story compounds
adoption; adoption produces more federated participants; federated
participants improve the model; better model improves adoption. The
opposite-of-OpenAI brand is also the flywheel.

The §7b mesh node daemon, the §7e router, the L4 consent ledger, the
§13B fiat-credit settlement — all four already exist as primitives. A
federated training round is just *another workload class* on the same
substrate.

#### Status
This is unbuilt today. §17 flags the mesh as simulator-only and the L7
orchestrator as deterministic. Federated training is a Phase 3 commitment,
not a Phase 0 / 1 deliverable. It is captured here so the substrate
decisions made in Phases 0 / 1 leave the seam open — specifically: the
node daemon must support workload classes beyond inference, and the
consent ledger must distinguish *donation* consent from *workflow* consent.

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

### How labor relates to the broader service-brokering pattern
The labor flow described above is one **instance** of a much broader class of
"the OS acts as the user's agent against a third-party service" flows — cab
booking, hotel booking, train / flight / bus tickets, food, groceries,
contractor / electrician / doctor / tutor matching. The shape is shared
(voice intent → match → negotiate → escrow → execute → audit), and the
substrate is shared (Bharat OS's own L6 service marketplace, never a third
party's). The labor case is special only because of the vulnerable-user
posture (design problems A and B above) and the legal weight of labour-law
and child-labour safeguards. See **§9B** for the general pattern, the
substrate-ownership principle, and the relationship to ONDC.

---

## 9B. Service brokering — the general pattern (Bharat OS owns the substrate)

§9A described the labor-matching flow in depth. Reread end-to-end, that flow is
one instance of a much larger class: **voice intent → match → negotiate →
escrow → execute → audit**. The same shape covers cab booking, hotel booking,
train/flight/bus tickets, food delivery, groceries, contractor / electrician /
plumber matching, doctor appointments, tutoring, lending and insurance quotes
— *every* time the OS acts as the user's agent against a third-party service.
The labor case is special only because of the vulnerable-user posture (§9A
design problems A and B) and the legal weight of labour-law and child-labour
safeguards. The architecture underneath is the same architecture.

This is what separates Bharat OS from a SaaS "AI assistant" pasted on top of
existing apps. The L7 orchestrator + L6 skill marketplace + L3 tool layer
were always designed for service brokering. The §9A worker protections we
encoded in L4 are partly general-purpose: `policy.worker.no_advance_fee`,
`policy.money.fiat_settlement_only`, `policy.worker.escrow_required` apply to
*any* action with the relevant fields set, not only labor flows.

### Why not just wrap Uber / Ola / MakeMyTrip — and why we don't even depend on ONDC

The instinct is "let the OS call Uber's API behind a voice command." That
fails three ways:
1. **API access is hostile.** Uber, Ola, MakeMyTrip, Zomato, Swiggy own the
   customer relationship; they have no incentive to let a third-party agent
   broker bookings for free. Their public APIs are partner-tier, narrow, and
   priced as referral schemes — not as a substrate an OS can sit above.
2. **Regulatory weight.** A cab booking that goes through Bharat OS as a
   regulated aggregator pulls it into the Motor Vehicle Aggregator
   Guidelines 2020 (state aggregator licenses, fare caps). Hotels carry
   hospitality compliance; trains carry IRCTC's rules; flights carry DGCA.
3. **No moat.** Wrapping aggregators is what AGI Inc. and Rabbit attempt and
   it tops out at the UI-automation reliability ceiling (§10).

A second instinct, more defensible but still wrong as the destination, is
"build on top of ONDC." ONDC (Open Network for Digital Commerce), on the
Beckn protocol, is a government-backed open marketplace where any buyer-side
app can discover and transact against any seller-side app. Cabs (Namma
Yatri), food, groceries, hotels, and B2B are live. It is explicitly designed
to displace walled-garden aggregator dominance.

But **Bharat OS is an OS, not a buyer app**. An OS does not sit *under* a
protocol designed for any-buyer-any-seller. If the matching, trust,
settlement, policy, and audit all live in ONDC, Bharat OS is reduced to a
voice front-end — a thin layer above someone else's marketplace, with its
value capped by what ONDC chooses to expose and its evolution governed by a
committee Bharat OS does not control.

### The principle: Bharat OS owns the marketplace

The L6 service marketplace is **Bharat OS's substrate, not a third party's**.
What that means concretely:
- **The provider registry** (drivers, hotels, professionals, contractors who
  joined the network) lives in Bharat OS — KYC'd via IndiaStack (§7d),
  identity-anchored (L5), Trust-Passport-rated (§7c).
- **The matching engine** (which provider for which user, ranked by Trust
  Passport + proximity + price + fairness) is Bharat OS code on the mesh
  (L2). No external protocol decides this.
- **Settlement** runs on Bharat OS's UPI escrow (L3 + §13B) — no extra hop.
- **Policy enforcement** — §9A protections, dispute resolution, deactivation
  rules — is L4, with audit hashes, not opaque committee discretion.
- **The audit ledger** of every booking lives on Bharat OS's mesh and audit
  surface, not in a counterparty's logs.

This is what "operating system" means at the service layer: the substrate is
the OS itself.

### How ONDC fits — bridge, not foundation

ONDC is still useful, but only as a **bridge**, not the substrate:
- **Phase A density bootstrap.** When Bharat OS's native provider registry is
  empty, Bharat OS can integrate ONDC as *one discovery source* among
  several, so the user gets a usable cab even before native supply exists.
  An ONDC bridge skill (`bos:skill:ondc-bridge`) speaks Beckn outbound; the
  result is normalized into the Bharat OS marketplace receipt shape so the
  caller cannot tell the difference. This is a temporary lever, not a
  long-term posture.
- **Interoperability — Bharat OS speaks Beckn inbound too.** Bharat OS
  exposes Beckn-compliant endpoints so an ONDC buyer-side app can discover
  Bharat OS sellers (and vice versa). Reach without surrender of substrate.
- **Phase B and beyond.** As native supply grows, the bridge's share of
  bookings shrinks. ONDC becomes a peer network Bharat OS interops with,
  not a layer it sits above.

This is the same posture Bharat OS takes toward MOSIP / UPI in §13C — adopt
the open protocols, but own the OS-level integration.

### A third mode: app handoff (the user's already-installed app)

A real user may already have Uber, Ola, Rapido, Namma Yatri, MakeMyTrip,
OYO, IRCTC, Swiggy, Zomato, BigBasket, or Blinkit installed. Forcing them
to switch is disrespectful and unrealistic. Bharat OS does the
**vernacular voice intent** part and **hands off** the transaction to
their preferred app via Android intent / deep link, with the route or
order pre-filled.

This is **not** the "wrap Uber" pattern rejected above. The distinction:

| Mode | Bharat OS captures customer? | Bharat OS transacts? | Aggregator-licensing exposure | Pattern |
|---|---|---|---|---|
| Wrap (rejected) | Yes — pretends to be the marketplace | Yes — brokers booking via Uber's API | Yes (MV Aggregator Guidelines, hospitality, etc.) | What AGI Inc. attempts; reliability ceiling |
| **Handoff (allowed)** | No — transparent: *"opening Uber for you"* | No — user pays in their own app | No — Bharat OS is a launcher, not an aggregator | `uber://`, `olacabs://`, `mmyt://`, `irctc://`, `swiggy://`, web fallback |
| Native marketplace | Yes | Yes (UPI escrow) | Bharat OS is the regulated entity | The §9B substrate |
| ONDC bridge | Buyer-app only | Buyer-app only | Buyer-app, not aggregator | Beckn protocol |

The L6 service marketplace tool returns **all three** in the receipt:
- `chosen.providerName` + `payment.uri` (the native or ONDC-bridge booking)
- `appHandoffs[]` (a list of deep links + web fallbacks for known apps)

The shell renders the native booking *first* (because §15 substrate-
ownership), then below it: *"Or open in your app: Uber · Ola · Namma
Yatri · …"*. User picks. Bharat OS is respectful of pre-existing user
loyalty without giving up the substrate-ownership thesis.

**User preference is the routing signal.** Once the user picks Ola for
cabs three times, Bharat OS records the preference in L5 memory and
the next *"book a cab"* intent ranks Ola's handoff first. The native
marketplace and ONDC bridge stay one tap away.

Why this matters strategically: the most common investor question is
*"what if I already use Uber?"* — *"we hand off to Uber on your phone
and don't take a cut, but the same voice intent also surfaces a 0%-
commission native driver and an ONDC option so the choice is yours"* is
a much better answer than *"we'll make you switch."*

### Phase B: native marketplace is the default

In steady state, providers (drivers, hotels, professionals, contractors) run
Bharat OS on the *work side* — exactly as Uber's driver app is a different
surface from its rider app. The L6 marketplace + the mesh + Trust Passport
are the matching substrate directly. The ONDC bridge remains available for
counterparties that prefer the public network; it just stops being the path
of first resort.

The differentiators vs. native aggregators in Phase B are things
aggregators structurally cannot match:
- **No commission predation.** Take rate from the buyer side; the provider
  keeps near-100% of the earned amount.
- **UPI escrow by default.** No payment ambiguity, no hidden spreads.
- **Voice-first work assignment** in the provider's own language — Hindi /
  Marathi / Tamil / Bengali / Bhojpuri today (§17), 22 languages over time.
- **Trust Passport portability** across services. A driver's reliability
  rating goes with them; it is not the aggregator's hostage.
- **Auditable policy enforcement.** Deactivation, surge pricing, wage floors
  are L4 policies with audit hashes — not platform discretion.

### Settlement principle (binding under §15)

The user pays the *provider* for the service they consume — a cab fare, a
hotel room, groceries. The user never pays *Bharat OS* for access. Bharat
OS earns through (§13A): a platform fee on successful transactions (paid by
the demand-side business or implicit in the take rate from the seller's
share), the mesh / marketplace spread, and B2B verified-workflow fees.
Workers / providers also never pay Bharat OS to find work (§15). All
settlement remains fiat-denominated, non-transferable credits on UPI — no
tokens.

### Worker / provider protections generalize

The §9A protections we encoded in L4 already apply where the action involves a
worker subject. A cab driver, a delivery rider, a contractor, a small hotel
operator are all "providers" in this taxonomy and inherit the protections:
no advance fees, escrow required, minimum-floor on per-job earnings (where
applicable and a floor is declared), age verification, no operator-acting-
as-provider on kiosk channels. New verticals add their own vertical-specific
rules (e.g., flight-cancellation refund timing, hotel-cancellation policy)
without disturbing the core set.

### Honest hard parts
- **Native provider acquisition is the whole game.** Owning the substrate
  means Bharat OS has to convince drivers, hotels, professionals to register
  directly. Uber spent on the order of $2B in India on driver subsidies.
  Bharat OS cannot match that. The pitch must be commission-free + UPI
  escrow + voice work assignment in vernacular + Trust Passport portability
  — not cash incentives.
- **The bridge is a crutch, not a strategy.** While the ONDC bridge is
  serving Phase A demand, the team must be obsessed with native supply
  growth. If the bridge becomes load-bearing, Bharat OS has quietly slipped
  into the "buyer app" position the doc explicitly rejects.
- **Cold-start verticals.** Some verticals will have neither native supply
  nor ONDC coverage at launch. The right move is to stay a *discovery
  surface* — show options sourced from public data, hand off to the seller's
  own checkout — rather than pretend depth that does not exist.
- **Aggregator-licensing line.** Some verticals require Bharat OS to be
  discovery-only to stay outside aggregator-licensing regimes. The L7
  orchestrator already supports this — the plan can stop at "present
  options" without invoking the payment skill.

---

## 9C. Real-world use cases — what people actually do with Bharat OS

The architectural sections describe layers and flows in the abstract. This
section grounds them in concrete user stories. Each vignette names the layers
involved so the architecture and the experience can be read together.

### 1. Sita the kirana shopkeeper applies for a loan (Varanasi, Hindi)
Sita runs a small shop and has never filled an English banking form. She picks
up the household phone, switches to her profile, and says: *"mujhe apni dukan
ke liye chhota karza chahiye, lagbhag pachas hazar ka"*. The vernacular
module (§7a, L8) routes to `regulated_onboarding`. The L7 orchestrator pulls
her income signal from Account Aggregator (L3) under a fresh consent grant
(L4), checks her GSTN registration via DigiLocker, and drafts the NBFC
application in Hindi with English fields auto-mapped. She voice-approves; the
application is submitted; the audit ledger records every step. **No paperwork
desk, no English form, no advance fee** (§15 binding).

### 2. Ravi the brick-kiln contractor hires labor (Eastern UP, Bhojpuri)
Voice intent: *"hamra bhattha khatir pachas mazdoor chahin, teen din,
chhah sau rupiya din"*. The vernacular module classifies as `labor_match_post`
in Bhojpuri-Devanagari (§7a disambiguation). The §9A worker-protection
policies fire automatically: wage ₹600/day is above the declared floor of
₹400 (pass); age attestation prompt issued to Ravi (he confirms hiring adult
workers); UPI escrow funded for ₹90,000. Bharat OS contacts 50 workers within
a 30 km radius — each gets a voice ping in their own language (Bhojpuri,
Hindi, or Maithili). Workers accept by voice; wages release on verified
completion. **No advance fee from the worker, no commission to a labor
agent.**

### 3. Lakshmi the grandmother checks her diabetes record (rural Tamil Nadu, Tamil)
*"enakku en sarkkarai noiyin pathivu kaattu"* (show me my sugar record).
The L8 module routes to `health_record_read` in Tamil. L4 finds an active
ABHA consent; L3 pulls the summary (not raw records — §15 pointer-not-payload).
Her latest HbA1c, last hospital visit, and active medications are read aloud
in Tamil. Her granddaughter requests access to share with a new doctor;
Lakshmi voice-approves a scoped consent grant with a 7-day expiry. **No
literacy required, no English UI, consent is auditable.**

### 4. Aarav the college student books a train (Bangalore, code-mixed Hindi-English)
*"Bangalore se Hyderabad ke liye Friday raat ka train book kar do, sleeper
class"*. The §9B service marketplace receives the intent. The native L6
provider registry has no inventory for trains in this prototype, so the
ONDC bridge is invoked under the hood — IRCTC-via-ONDC returns three
options. The §7e router routes the ranking computation to Aarav's own
device (fast, private). Aarav voice-picks the 10pm option; UPI escrow funds
₹620; the PNR comes back. The receipt records `sources: ['native',
'ondc-bridge']` — Bharat OS used the bridge but the user experience is
single-touch.

### 5. Suresh the cab driver receives a ride request (Patna, Bhojpuri)
Suresh has installed Bharat OS on the work-side. His phone pings him in
Bhojpuri: *"tees kilometer door sawari, char sau pachas kamai, accept kara?"*.
He voice-accepts; the UPI escrow is already funded by the rider; navigation
loads automatically. His Trust Passport rating (§7c) ticks up after a
verified completion. He pays **zero commission** — the §9B native
marketplace's take rate falls on the rider's platform fee, not on the
driver's earnings. At the end of the month he sees his total directly in his
UPI account.

### 6. A shared family phone with four profiles (low-income household, mixed languages)
One Lava smartphone, ₹6,000, runs Bharat OS. Four profiles: mother (Hindi),
father (Bhojpuri), college-going daughter (English/Hindi), school-going son
(Hindi). Each profile is its own §7c root keypair. Switching is a 2-second
voice biometric (or PIN for the son). The mother's profile holds her ABHA
consent; the daughter's holds her scheme-eligibility memory; the father's
runs his contractor side-business. **Identity is the person, not the
device** (§15 binding) — verified by the §9A design problem A audit log:
no one can act in another household member's name.

### 7. Priya the engineering student earns on the mesh (Coimbatore, Tamil + English)
Priya's Pixel 8a plugs in to charge at 11pm. The Bharat OS node daemon
activates (charging + WiFi + battery > threshold — §7b). Through the night
her NPU serves ~1.1M tokens of light inference to other Bharat OS users in
South India — short Tamil-Hindi translations, scheme-eligibility summaries,
WhatsApp draft suggestions. By morning she has earned ₹9 in UPI credits.
Over a month she earns ~₹270. She is a *net producer* on the §13B Net
Contribution Score, so her own Bharat OS usage is free. She paid for the
phone and the WiFi; Bharat OS turned the idle hours into income.

### 8. A CSC operator helps an elder enroll in a scheme (Bihar, assisted channel)
Saraswati is 67, has no smartphone, and cannot read. She visits the
Common Service Centre. The operator opens Bharat OS in kiosk mode. The
§9A mediation policy fires: a `mediation.kioskOperatorId` is recorded, AND
the system requires Saraswati's *own* voice authorization before any action
is taken. The operator guides her through scheme eligibility lookup
(DigiLocker land record, AA income summary), but every consent grant is
voice-confirmed by Saraswati personally. The audit log shows the operator
assisted but did not impersonate. Saraswati walks out with her PM-KISAN
application submitted, the receipt printed in Hindi, and nobody ever charged
her a fee. The L4 worker/user protections (§9A, §15) made this
non-negotiable.

### 9. Rajesh the CA stores eight years of client files on the mesh (Surat, Gujarati)
Rajesh runs a small CA firm with ~200 clients — ~120 GB of GST returns,
audit files, ITRs going back eight years. Generic cloud is out: DPDP +
client confidentiality + MeitY localization (§7d). AWS S3 India is ~₹250/mo
for 120 GB; Rajesh's bandwidth on uploads is also painful. He moves the
archive to Bharat OS mesh storage. The files are client-side encrypted
(pointer-not-payload, §15), Reed-Solomon erasure-coded, and distributed
across ~40 KYC'd peer nodes in Gujarat and Maharashtra (regulatory class
ensures Indian-only placement, §7d). He pays ~₹20/mo for 120 GB at the
₹150–200/TB/mo sell price (§13B Product 1). His own phone contributes
50 GB of capacity overnight → NCS slightly positive (§7b fair-use lever)
→ effective bill ~₹15. Audit hashes on every chunk prove tamper-evidence
when his client gets an Income Tax notice and needs to show the original
file wasn't altered. **Revenue stream:** §13A #1 mesh storage spread —
₹15–25 sell, ₹6–10 to the operators in his city, ₹9–15 platform.

### 10. Anjali books a cab from office to home (Bangalore, Hinglish — rider side)
9pm, Outer Ring Road. Anjali says: *"Cab book karo office se ghar"*.
The §9B native marketplace queries: the native registry surfaces Suresh
(yes, vignette 5 — Bharat OS is one network across both sides) at a fare
of ₹220 with 0% driver commission; the ONDC bridge offers Namma Yatri
at ₹240. The §7e router ranks the candidates on her own device (Trust
Passport score, ETA, fare), takes <100 ms. She voice-picks the native
option; UPI escrow funds ₹240 (₹220 fare + ₹20 platform fee billed to
her). Suresh's phone pings him in Bhojpuri; he voice-accepts; navigation
loads. On verified completion (drop-off geofence + Anjali's voice
confirmation), the escrow releases ₹220 to Suresh and ₹20 to Bharat OS.
Suresh keeps his full ₹220 because the §9B substrate-ownership decision
moves the take rate to the rider side, not the worker side (§15 binding).
**Revenue stream:** §13A #2 L6 service marketplace take.

### 11. A family plans a weekend in Munnar (multi-language, hotel booking)
The mother says in Tamil: *"velliyazhcha munnaril randu rathri family
room venum"*. The §9B native marketplace queries local homestays
registered directly with Bharat OS (KYC'd small operators in the Western
Ghats); the ONDC bridge brings in OYO and a couple of MakeMyTrip-listed
properties. Trust Passport surfaces past-traveler ratings (§7c). The
family picks a local homestay at ₹2,250/night × 2 = ₹4,500; a ₹450
platform fee is added on top. UPI escrow ₹4,950 funded. The homestay
owner — a small operator who never had a website — gets a voice ping in
Tamil; she voice-confirms; the booking is locked. On arrival, geofence +
both-party voice confirmation releases the escrow. **Three layers
monetize at once:** L6 marketplace take (₹450), L2 mesh stored the search
manifests, L8 vernacular handled both sides in Tamil. **Revenue stream:**
§13A #2 service marketplace + a small §13A #1 mesh storage tick.

### 12. An NBFC processes 10,000 loan applications/month (Hyderabad, B2B)
A mid-size NBFC routes its loan onboarding through Bharat OS. Each
application runs three workflows: UIDAI offline eKYC identity verify, AA
income summary, DigiLocker document validation — all token-only, no raw
PII to the model (§15). The NBFC pays ₹15 per *completed* verified
workflow → ₹1.5 L/month at 10k applications. Their previous KYC stack
cost ~₹40/application; they save ~₹2.5 L/month *and* get a portable
audit hash that satisfies RBI inspection. The customer pays nothing
(§15 binding). The NBFC's compliance team also exports the consent and
decision receipts to NDJSON (Phase 1.15) for their internal audit. **Revenue
stream:** §13A #4 B2B verified-workflow fees — the institution pays per
completed regulated action.

### 13. Lava ships its new ₹8,000 5G phone with Bharat OS pre-installed (OEM)
Lava signs a Bharat OS partnership: ~₹40/device licensing fee + a 10%
revenue share on service-marketplace bookings made on the device. Across
Lava's ~5 M units/year that's ~₹20 Cr in baseline licensing, plus a
growing service rev-share as adoption matures. Lava gets a clear
differentiation story against Realme / Xiaomi / Vivo — *"the only phone
that speaks your language and respects your data"* — and Bharat OS gets
distribution past the dev-toy phase (§14 risk closed). The user pays
nothing extra; Lava's BOM absorbs the licensing fee. **Revenue stream:**
§13A #5 OEM/telco licensing and service rev-share.

### 14. A regional logistics dispatcher coordinates 20 trucks (Indore, Pro tier)
A small fleet operator runs 20 trucks across MP, Gujarat, Rajasthan.
Each individual driver uses Bharat OS free (citizen tier). The dispatcher
subscribes to the **Bharat OS Business Pro** tier at ₹1,499/mo: bulk
job-posting (up to 200 jobs/day), priority matching, an analytics
dashboard, consolidated UPI reconciliation across drivers, and
ledger-grade audit export for GST. The §15 binding — *"workers/users
never pay"* — is preserved; the *business* pays for the management
overlay. Across ~50,000 such small businesses on Bharat OS over time at
~₹1,500/mo average, this stream alone is ~₹90 Cr/yr. **Revenue stream:**
§13A #6 Business Pro tier.

### 15. A landlord verifies a prospective tenant (Pune, Trust-as-a-service)
Sneha is renting an apartment in Kothrud. The landlord asks for a
Trust Passport attestation. With Sneha's explicit voice consent and a
14-day share expiry (§7c), the landlord pays ₹75 and receives an
attestation: *"Aadhaar verified · employment income band ₹50K–75K/mo
confirmed via AA · 24-month rent payment history clean · no §9A flags."*
The **underlying data** — exact income, employer name, prior addresses,
account numbers — is never shared (§15 zero-knowledge servers). Sneha
pays nothing. If the landlord ever tries to use the attestation outside
the 14-day window or shares it further, the L4 audit ledger flags it and
the attestation cryptographically expires. **Revenue stream:** §13A #7
Trust-as-a-service — the smallest and most carefully gated stream;
attestation, not data brokerage.

### 16a. Aman photographs a prescription and ABHA gets updated (Pune, Marathi + English)
After Aman's father's diabetes follow-up, the doctor hands him a hand-written
prescription. Aman opens Bharat OS, points the camera, and says in
Marathi: *"hi prescription ABHA madhe save kar"* (save this prescription to
ABHA). On-device IndicOCR extracts the text; the §7e local SLM (Sarvam-1
on his Pro-tier Pixel) parses it into structured fields — `{medication:
Metformin 500mg, frequency: twice daily, duration: 90 days, prescriber:
Dr. K. Joshi, date: 2026-05-20}`. The SLM also flags one ambiguous handwritten
word and asks Aman to voice-confirm. Aman approves; the L3 ABHA tool
adapter uploads the structured record under a fresh L4 consent grant. The
original photo stays in L5 encrypted memory (pointer not payload); only
the structured fields go to ABHA. **Same flow handles**: medical bills,
school reports, GST returns, ration cards, electricity bills, land
records — anywhere India's paper-heavy reality meets an IndiaStack API.
**Revenue stream:** none directly from Aman; if a clinic chain uses the
same pipeline at scale, §13A #4 B2B verified-workflow fees apply.

### 16b. Priya's day starts with a vernacular daily brief (Coimbatore, Tamil)
At 6:30 AM Priya's phone reads her a 90-second brief in Tamil: today's
calendar (a college viva + Sarvam internship interview at 4 PM), three
unread WhatsApp threads worth reading (summarized in one line each),
yesterday's mesh earnings (₹11), an upcoming UPI auto-debit she should
know about (₹2,400 electricity bill on Thursday), and a reminder that her
mother's ABHA-anchored medication refill is due. The brief is generated
fully on-device by the §7e local SLM, reading from: Android calendar API,
notification history (with permission), L5 encrypted memory, the §13B
NCS dashboard, and the L4 consent ledger. Nothing leaves the device.
Priya voice-edits the brief ("skip the WhatsApp summary today, just read
the calendar"), and the SLM adjusts. **Layers:** L8 voice loop, §7e
local SLM, L5 memory, L4 ledger, Android system APIs. **No revenue line**
— citizen-facing, §15 binding.

### 16. A media company batch-summarizes 200 hours of conference video (compute demand)
A Bangalore tech conference needs Hindi / Tamil / English transcripts +
summaries of 200 hours of recorded sessions for their archive. They
submit the batch as a Bharat OS compute job. The §7e adaptive router
shards the work across ~80 KYC'd peer nodes overnight in Tier-2 cities
(Mysuru, Hubballi, Mangaluru, Belagavi). The audio first hits IndicWhisper
on the operators' devices for ASR; transcripts then route to AI4Bharat /
Sarvam-1 on the same devices for summarization in three languages. ~24 M
tokens served across the night → operator payouts total ~₹192 (₹6–10/M
× midpoint); conference org pays ~₹384 (mesh sell price ₹15–25/M × 24).
Comparable AWS Bedrock pricing for the same workload: ~₹1,800. Conference
org saves ~₹1,400; operators in four small cities earn real rupees from
idle phones; the platform keeps ~₹192 spread. **Revenue stream:** §13A #1
compute mesh spread — the §13B Product 2 line in action, end-to-end.

### Revenue-stream coverage — which use cases exercise which stream

| §13A revenue stream | Vignettes |
|---|---|
| #1 Compute & storage mesh spread | 7 (Priya supply), 9 (Rajesh storage), 11 (mesh manifests), 16 (conference compute) |
| #2 L6 marketplace take rate (skill + service) | 4 (train), 5 (driver supply), 10 (cab rider), 11 (hotel) |
| #3 Demand-side transaction fees | 2 (Ravi labor), 10 (cab), 11 (hotel) |
| #4 B2B verified-workflow fees | 12 (NBFC loan onboarding) |
| #5 OEM / telco licensing and rev-share | 13 (Lava) |
| #6 Business Pro tier | 14 (logistics dispatcher) |
| #7 Trust-as-a-service (consent-bound attestation) | 15 (landlord) |

Citizen-facing vignettes (1, 3, 6, 8) deliberately have **no revenue line**
— §15 binding. Bharat OS earns from businesses, developers, the
infrastructure spread, and OEMs; never from the citizen or worker.

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
- **Open commerce is a DPI rail too.** ONDC (Open Network for Digital
  Commerce), built on the Beckn protocol, is already brokering cabs (Namma
  Yatri), food, groceries, and hotels as a public-good marketplace explicitly
  designed to displace walled-garden aggregator dominance. Bharat OS does
  not *depend* on ONDC (§9B — Bharat OS owns its own L6 marketplace), but
  the existence of an open commerce rail is a precedent that the public-good
  marketplace pattern is viable in India, and ONDC interop is a useful Phase
  A bridge while native supply is bootstrapping.
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

## 10B. Side-by-side — Bharat OS vs Brain.ai vs Apple Intelligence vs Google Gemini vs Microsoft Copilot+ vs Rabbit/AGI

§10 names the players; §10A names the precedents; this section is the
explicit comparison the founder will be asked for in every conversation.

### The comparison table

| Axis | Bharat OS | Brain.ai Natural OS | Apple Intelligence | Google Gemini in Android | Microsoft Copilot+ PC | Rabbit R1 / AGI Inc. |
|---|---|---|---|---|---|---|
| Where the AI runs | Adaptive: local SLM ↔ KYC'd mesh peer ↔ cloud (§7e) | Cloud (US) | On-device + Apple private cloud | Mixed: Gemini Nano on device, larger in cloud | NPU on Copilot+ PC + Azure cloud | Cloud |
| Language scope | 22 Indian languages from day one, voice-first, romanized + native script | English-first; Japanese (SoftBank launch) | English + ~12 major languages | ~40 languages, major-language quality | English-first | English |
| Identity layer | IndiaStack (Aadhaar optional, Account Aggregator, DigiLocker, ABHA) | None (account-based) | Apple ID | Google account | Microsoft account | Anonymous / account |
| Sovereign data localization | Native (Indian devices + KYC'd mesh; never crosses the border by default) | US/Japan cloud | Apple's global cloud | Google's global cloud | Microsoft's global cloud | Cloud |
| DePIN / mesh | Native at L2 (compute + storage + UPI fiat-credit settlement) | None | None | None | None | None |
| Marketplace ownership | Native L6: skill marketplace + §9B service marketplace | None | App Store (Apple-owned, 30% take) | Play Store (Google-owned) | Microsoft Store | None |
| Voice-first interface | Yes — Bhashini / IndicWhisper / IndicTTS, OS center | Yes (limited to English/Japanese) | Siri (auxiliary, not OS center) | Assistant (auxiliary) | Limited | Yes |
| Regulated workflows | Native (UPI, DigiLocker, AA, ABHA, GSTN, ICEGATE) | None | None | None | None | Explicitly avoided (founder admission) |
| Settlement rail | UPI fiat credits, non-transferable, RBI-clean | Card | Card / Apple Pay | Card / Google Pay | Card | None (UI-scraping only) |
| Distribution path | OEM/telco shell on AOSP | SoftBank-distributed phones | Apple hardware (closed) | Pre-install on Android | Pre-install on Windows | Standalone hardware |
| Reliability at scale | Phase 1 prototype | Commercial (Japan, 2026) | Shipping | Shipping | Shipping | Stumbling — AGI Inc. founder admits ~50-step ceiling |
| Cost to end user | Free for citizens; businesses pay (§13A) | Paid hardware/subscription | Bundled with Apple device | Bundled with Android device | Bundled with Copilot+ PC | Paid hardware ($199–$699) |

### Where Bharat OS has structural advantage
None of these are wishful — each is rooted in something the doc binds.

1. **Vernacular-native with a public-good language stack (§7a).** AI4Bharat,
   Bhashini, IndicWhisper, IndicTTS, IndicTrans2 are state-funded and open
   source. Brain.ai would need 5–7 years and $50M+ to match what an Indian
   builder can take off the shelf in ~6 months. Apple / Google / Microsoft
   can hire Indian-language teams, but they cannot replicate sovereign
   ownership of the corpus and models.
2. **DePIN at the OS layer (§7b).** Helium and Filecoin are bolted-on apps
   fighting Android Doze and iOS background limits. Bharat OS *is* the OS;
   the node daemon is a system service, not a fighting app. No competitor
   even attempts this.
3. **Sovereign identity via IndiaStack (§7d).** UIDAI, UPI, DigiLocker, AA,
   ABHA are not APIs you call — they are regulated rails with KYC, consent,
   and legal-binding-grade attestation. No foreign OS can access them at
   the OS layer.
4. **Native marketplace ownership at L6 (§9B, §15 substrate-ownership).**
   Brain.ai has no marketplace. Apple / Google take 15–30% of every app
   transaction; Bharat OS's service marketplace takes from businesses, not
   users (§15 binding). And Bharat OS owns its substrate — unlike a buyer
   app sitting under ONDC, Uber, or someone else's protocol.
5. **Adaptive model router (§7e).** Brain.ai is structurally cloud-only;
   Apple is structurally on-device-only. Neither can route per request
   without rebuilding their architecture. Bharat OS routes by privacy class,
   latency budget, compute availability, and network — the only architecture
   that gives both sovereignty and frontier quality.
6. **UPI escrow as default settlement (§13A, §15).** No card friction, no
   3-day clearing, no chargeback risk for verified completions. RBI-clean,
   no token regulatory exposure.
7. **India-first regulatory shape (§7d).** DPDP, AA empanelment, AUA
   partnership, MeitY data localization — Bharat OS is built FOR these
   constraints; the foreign players are built AROUND them.

### Where Bharat OS is structurally disadvantaged
Equally honest.

1. **No hardware.** Apple owns silicon-to-shell. Bharat OS depends on an
   OEM/telco partner (§10, §12). Without that partner, it is a dev toy.
2. **No global brand.** Apple, Google, Microsoft have decades of consumer
   trust. Bharat OS starts at zero.
3. **No frontier model of its own.** §7e's cloud-tier is a dependency
   (whichever provider). If frontier API pricing or terms change adversely,
   Bharat OS is exposed at the cloud tier — though the local + mesh tiers
   mitigate this.
4. **Smaller capital.** §12 puts the credible Phase-0-to-Phase-2 capital
   need at ₹3–8 Cr ($3–8M). Apple's quarterly R&D run-rate exceeds this by
   four orders of magnitude.
5. **Provider acquisition cost (§9B Phase B).** Uber spent ~$2B in India on
   driver subsidies. Bharat OS cannot match that and must win on
   commission-free + UPI escrow + voice work assignment.
6. **AOSP-only (§15 binding).** Forfeits iOS — ~3% of India by units but the
   premium segment by spend.
7. **Aadhaar politics.** Optional-by-design is firm but operationally
   tricky; Kenya's Huduma Namba and Worldcoin's bans are the cautionary
   precedents (§10A).
8. **Well-funded Indian rivals on the same ground.** Sarvam, Krutrim, and
   others are building Indian-language AI; vernacular-native is an
   advantage, not a monopoly. The §9B substrate-ownership thesis is what
   differentiates beyond language.
9. **Multi-quarter L8 generative-UI work still ahead.** §17 says only the
   deterministic vernacular normalizer is built today; the actual
   generative-UI experience that competes with Brain.ai's strongest demo is
   future work.

### Net read
Bharat OS wins on the axes where the substrate matters — vernacular,
identity, mesh, marketplace, regulated workflows — because those are
structurally not copyable by a cloud agent, an on-device assistant, or a
walled-garden OS. Bharat OS loses on the axes where execution capital, brand,
and hardware ownership matter — and the only mitigation is an OEM/telco
partner plus disciplined India-first focus. Win on substrate, partner on
distribution.

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
- **Phase 2a (months 12–18): PWA / Android app distribution — and this is
  ~85% of the product.** Bharat OS as a Progressive Web App (and
  optionally a native Android shell) on the user's existing phone. **The
  PWA scope is not a stripped-down preview** — it is the real product
  for the majority of §6 layers:
  - **L3 IndiaStack adapters** — DigiLocker / AA / ABHA / UIDAI offline
    eKYC are public OAuth or REST flows; the PWA hits them the same way
    a native app would. UPI uses `upi://pay?…` deep links.
  - **L4 policy + consent, L5 identity + memory vault, L6 marketplace,
    L7 orchestrator** — all are pure JavaScript today; they run inside
    the PWA process unchanged.
  - **L8 vernacular voice** — IndicWhisper compiled to WASM (or
    whisper.cpp.js) for ASR, IndicTTS via WASM for synthesis, browser
    SpeechSynthesis as fallback. Real Indic voice, no Google Cloud
    round-trip.
  - **L8 generative on-device SLM** — Phi-3 / Gemma 2 / Sarvam-1 (small
    variants) via **WebGPU + transformers.js or llama.cpp.wasm**. Real
    on-device ML, not deterministic regex.
  - **Document capture + OCR** — `getUserMedia` camera + Tesseract.js
    for Indic OCR + SLM-driven field extraction (§9C vignette 16a:
    prescription → ABHA structured upload).
  - **Biometric per-profile auth (§9A design problem A)** — WebAuthn
    (`navigator.credentials`) gives fingerprint/face on Android phones
    with no native code.
  - **Worker job notifications** — Web Push works on installed PWAs and
    is nearly indistinguishable from native on Android.
  - **L2 mesh contribution (limited)** — Background Sync / Periodic
    Background Sync run while the PWA is installed. Less persistent than
    a system daemon, but enough to demonstrate the mesh story.
  - **Federated learning (§7f)** — TensorFlow.js or ONNX Runtime Web for
    the on-device training round.
  - **L5 device pairing (§7c)** — camera + WebRTC for the QR-based
    browser-to-browser encrypted handoff; no server in the middle.
  - **L3 ONDC bridge** — same Beckn HTTP calls as a native client.

  No OEM dependency. The right MVP path for a solo founder pre-funding.
- **Phase 2b (months 18–30): AOSP shell on a partner OEM — wins the
  remaining ~15% the PWA structurally cannot.** The bits that need the
  OS layer are specific and small in number:
  - **Persistent mesh node daemon.** Android Doze kills tabs / SW. A
    system service runs continuously — this is exactly §7b's
    *"owning the OS fixes mobile DePIN."*
  - **Launcher / home-screen replacement** so Bharat OS *is* the phone,
    not an app on someone else's phone.
  - **System-wide intent capture** (wake word at the assistant layer,
    not gated by Google Assistant).
  - **TEE attestation** at the OS level (Knox / StrongBox / QSEE) —
    §12 hard part, ~6–9 months.
  - **L4 policy enforcement at syscall level** rather than only inside
    the Bharat OS process.

  Requires the OEM LOI (§14 P0 risk) and the §12 ₹3–8 Cr seed.
- **Phase 2c (months 30+): full flashable ROM, multi-OEM.** Multiple OEM
  partners. AUA partnership for online auth. L8 generative UI fully
  built (Bhashini / IndicWhisper / IndicTTS / IndicTrans2 integrated, not
  just the deterministic normalizer). L6 skill marketplace open to
  third-party developers.
- **Phase 3 (month 30+): open the marketplace and the mesh** to
  third-party developers; explore export to other IndiaStack-adopting
  countries (Sri Lanka's SLUDI, Philippines' PhilSys, Morocco's CNIE).

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

2. **L6 marketplace take rate — skills *and* services.** An app-store model
   — a cut (≈15–30%) on paid skills and on transactions that skills
   facilitate, *plus* a take rate on bookings through the §9B native service
   marketplace (cabs, hotels, tickets, food, groceries, professional
   services). Because Bharat OS owns the service marketplace substrate
   rather than sitting under ONDC (§9B, §15 substrate-ownership), this take
   rate is captured directly — not split with a third-party protocol.
   Network-effect revenue that compounds as both the KYC'd developer
   ecosystem and the native provider registry grow.

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
spread. The **adaptive model router (§7e)** is what makes this market exist —
every time the router escalates beyond a user's local SLM, the destination is
either a KYC'd peer node (where money changes hands inside the marketplace) or
the cloud (where the platform pays a frontier provider out of the same spread).

| | per 1M tokens (combined I/O) | per batch job (≤100k tokens) |
|---|---|---|
| AWS Bedrock SLM-class (India region) reference | ₹65–95 | ₹6–10 |
| Mesh sell price | ₹15–25 | ₹1.5–3 |
| Operator payout | ₹6–10 | ₹0.6–1.2 |
| Platform gross spread | ₹9–15 | ₹0.9–1.8 |

**How an operator actually earns.** A modern phone's NPU running a 4-bit
quantized 3B model (see §7e candidate list) sustains roughly 30–50 tokens/sec.
Over a 6-hour overnight charging window that's ~0.8–1.2M tokens served, or
₹5–12/device/night at the midpoint payout rate. Modest per device — meaningful
at scale (1M active operator-nights/day = ₹0.5–1.2 Cr/day in operator
earnings, and another ~50% of that flowing as platform spread).

**Reality check:** device compute is weak and intermittent, only small or
quantized models run on-device, and heavy workloads still route to the cloud.
The mesh captures the *routable fraction* — light/medium inference, caching, and
batch jobs — not all inference. The §7e cloud-tier requests are NOT in the
operator-payout column above; they pay the frontier provider out of the same
sell-side credits. Model the mesh share as a slice of inference demand, not the
whole pie.

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

## 14A. Patent landscape — what to know, what to defend, what isn't a risk

This deserves an honest answer rather than reassurance. Patents in this space
are real, but the landscape for an India-deployed product is materially more
permissive than the US/EU news cycle suggests.

### Where the real risk concentrates
- **Brain.ai's four foundational agent patents (filed from 2016 onward).**
  Cover material around generative UI materialization from natural language
  intent and agent-orchestrated tool execution. These are the most
  Bharat-OS-adjacent patents in the field. Treat them as the primary
  patent-watch concern, especially if Bharat OS ever expands into the US or
  Japan markets where Brain.ai is active.
- **Apple's Siri / Apple Intelligence / Neural Engine patents.** Broad
  portfolio around intent parsing, on-device inference scheduling, voice
  biometrics. Most apply to specific implementation tricks rather than the
  high-level architecture.
- **Google's Assistant / Gemini / Tensor patents.** Similar shape — implementation-
  level rather than architectural.
- **Microsoft's Copilot patents.** Concentrated around document-grounded
  agents and Copilot-for-X patterns.
- **DePIN-adjacent patents (Helium, Filecoin, Render).** Mostly tokenomic
  mechanism patents — proof-of-coverage, proof-of-storage variants. Bharat
  OS's mesh is deliberately *not* tokenized (§15), which side-steps the
  bulk of this portfolio.

### Why the India-deployment risk is structurally lower
- **Section 3(k) of the Indian Patents Act, 1970** excludes *"a computer
  programme per se or algorithms"* from patentability. Pure software /
  algorithm patents are very hard to enforce in India. A Brain.ai US
  patent on "materializing UI from intent" is largely unenforceable against
  an Indian-deployed product in India.
- **Alice Corp. v. CLS Bank (US 2014)** invalidated a large swath of abstract
  software / business-method patents in the US, narrowing what an offensive
  plaintiff can credibly assert anywhere. Many older agent-era patents
  would not survive an Alice challenge today.
- **Bharat OS's distinguishing features are architectural and
  India-specific** — IndiaStack integration, the §7e adaptive router, the
  §9B native service marketplace, the L2 KYC'd mesh, the §15 substrate-
  ownership posture. These are *systems* claims grounded in specific Indian
  public infrastructure; they are not easily anticipated by foreign patents
  written about generic agent architectures.
- **The L3 IndiaStack adapters call government APIs** (UIDAI, UPI, DigiLocker,
  AA, ABHA). API surface use is not patentable; the underlying systems are
  state-owned.

### Defensive strategy
1. **Open source the obvious novelty.** Publishing the §7e router design,
   the §9B native marketplace structure, the §9A worker-protection policy
   set, and the L2 mesh fair-use lever creates dated prior art that makes
   *future* patents in these areas harder for anyone to assert against
   Bharat OS. Open source is patent defense.
2. **File a small defensive portfolio on the genuinely novel pieces.**
   Candidates: mesh-anchored adaptive routing with regulatory-class
   selection (§7d intersection of §7e); identity-bound consent receipts
   with revocation integrity (§7c + L4); §9A worker-protection policy
   composition (escrow + wage floor + age + mediation as a system).
   The objective is defensive cross-licensing, not offensive monetization.
3. **Avoid known patent hotspots in implementation choices** where
   alternatives exist — e.g., specific UI-generation rendering techniques
   that mirror Brain.ai's claims. Where Bharat OS *does* generate UI
   (L8 future work), prefer techniques with clear prior art (v0 / Bolt /
   open-source generative UI research) and document the lineage.
4. **Engage patent counsel before any expansion outside India.** §13C
   strong-fit countries (Philippines, Ethiopia, Togo, etc.) carry different
   patent regimes; the EU's EUDI Wallet partial-fit and US poor-fit
   scenarios in §13C also flag higher patent risk in those jurisdictions.
   Stay India-first not only for distribution but also for legal exposure.

### The bigger non-patent legal exposure
Patent litigation is **not** the largest legal risk Bharat OS carries. The
real exposure is:
- **DPDP Act 2023 compliance** — data fiduciary registration, consent
  artifacts, breach protocol (§7d / §12). A DPDP violation has teeth.
- **Aadhaar Act §7** — Aadhaar must be optional with viable fallbacks
  (§15 binding, §14). Forcing Aadhaar invites real litigation.
- **RBI rules on payment intermediation** — UPI payouts, TDS, KYC limits
  (§12). Mis-structured settlements can trigger payment-aggregator
  licensing requirements.
- **MeitY data localization** — handled by architecture (§7b mesh stays
  in India) but compliance still needs documentation.
- **Motor Vehicle Aggregator Guidelines 2020 and similar vertical regimes**
  (§9B). The "buyer app on a network" posture sidesteps these; transacting-
  aggregator framing would trigger them.
- **Labour law** (§9A). Real, enforceable, and has criminal provisions for
  child labour. The §9A policy set is necessary but not sufficient; NGO /
  labour-law partner engagement remains in §17's open items.

### Net read
Bharat OS is not violating any patents we can identify *for an India-deployed
product today*. The single closest patent-watch concern is Brain.ai's
foundational portfolio if Bharat OS ever expands into Brain.ai's home
markets. Defensive open-sourcing, a small defensive patent portfolio, and
patent counsel before international expansion are the right posture. The
larger legal weight is regulatory (DPDP, RBI, MeitY, labour law) — already
the focus of §12 and §14. None of this is reassurance; it is the honest
shape of the risk.

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
- **Substrate ownership** — Bharat OS owns its L6 marketplaces (skill
  marketplace, service marketplace), its L2 mesh, its L4 policy engine, its
  L5 identity vault, and its audit ledger. Third-party protocols and
  networks (ONDC, Beckn, MOSIP, future analogues) may serve as Phase A
  density bridges or interop surfaces — never as the substrate above which
  Bharat OS runs. An OS that sits *under* a buyer-protocol is a buyer app;
  Bharat OS is the OS. §9B is the canonical statement of this principle.
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

---

## 17. Current implementation status (snapshot — 2026-05-23)

A living snapshot of how much of the canonical architecture (§6) and roadmap
(§13) is actually built in the accompanying repository. This section is **not
binding** — §0, §6, and §15 are the binding parts. Update this in place when
code lands; do not create a separate `STATUS.md` (§16).

### Phase progress
- **Phase 0 — protocol + identity + mesh:** complete *in simulation*. PowerShell
  baseline spec (`src/BharatOS.Phase0/`) + Node Phase 0.1 core/store
  (`src/phase0/`). Deterministic 1,000-node bootstrap simulator; local HTTP API
  and operator console.
- **Phase 1 — decision layer:** in deep iteration (1.1 → 1.43 as of this
  snapshot). 1.37 multilingual L8 vernacular module; 1.38 §9A worker-
  protection policies; 1.39 §9B native service marketplace +
  ONDC bridge; 1.40 NCS surfacing through API / CLI / Trust Passport;
  1.41 worker authorization as a signed first-class artifact with
  signature-level mediation policy enforcement; 1.42 Phase 1 tie-off
  bundle (operator console panels, CLI commands, PWA conversion of the
  operator console, device-pairing scaffold for §7c portability);
  **1.43 user-facing vernacular shell at `/shell/`** (the actual product
  surface — voice-first or text, persona-aware, per-action result
  cards) + a device-claim model (owner + household, not the system
  registry). All built against *mocked* tools where the doc says
  *mocked*. 162/162 tests green.
- **Phase 2a — PWA / app distribution: ~85% of the product is
  PWA-buildable.** In progress. 2a.1 lands the first product-feel
  transaction: `service_booking` receipts now carry UPI deep-links and
  `/shell/` renders a `Pay with UPI` action. 2a.2 adds health document
  capture -> structured OCR extraction -> mocked ABHA upload, consent-
  gated under `health.record.write`. 2a.3 adds WebAuthn per-profile
  passkey binding as a metadata/challenge-evidence scaffold. 2a.4 adds
  worker-notification receipts + PWA service-worker local alerts. 2a.5
  adds Indic ASR runtime planning and local model-pack metadata. 2a.6
  adds TTS runtime planning and shell Listen controls. 2a.7 adds
  on-device SLM runtime planning and model-pack metadata.
- **Phase 2b — AOSP shell on OEM:** not started. Wins the remaining
  ~15% (persistent mesh daemon, launcher replacement, system-wide intent
  capture, TEE attestation at OS level, syscall-level L4 enforcement).
- **Phase 2 — flashable ROM + L8 + L6 marketplace:** not started.
- **Phase 3 — open marketplace + export:** not started.

### Per-layer status

| Layer | Built | Boundary / gap |
|---|---|---|
| L1 — AOSP substrate + node daemon | none | no fork, no daemon, no kernel scheduling work |
| L2 — Mesh + adaptive router | placement simulator only (`src/phase0/simulate.mjs`); NCS computed from nodes + memory and surfaced through API / CLI / Trust Passport / console | no real P2P, no TEE attestation (Knox/StrongBox/QSEE), no erasure-coded transport, no fiat-credit settlement plumbing on UPI |
| L3 — IndiaStack tools | six mocked adapters returning tokens, not PII (`src/phase1/tools.mjs`); ABHA now supports a mocked structured document-upload receipt from captured OCR observations | no AUA/KSA partnership; no DigiLocker / AA / ABHA empanelment; no real ABHA write API yet |
| L4 — Policy + consent ledger | signed consents, lifecycle, queryable + NDJSON-exportable audit ledger, ten policy rules including the full §9A worker-protection set (advance-fee, escrow, wage floor, age, signed mediation authorization, fiat-only) | policies are local code, not a DSL; no distributed revocation log; no human-review / dispute workflow for worker-protection violations |
| L5 — Identity-anchored memory | encrypted local records, pointer-not-payload, consent-gated reads, metadata-only search and provenance; device-pairing scaffold for QR / recovery phrase portability; profile passkey credential scaffold (`src/phase1/profile-auth.mjs`) with challenge evidence + ledger persistence | not distributed across the mesh; no production cryptographic pairing / vault migration; passkey scaffold does not yet do full FIDO2 attestation/assertion signature verification or replay-proof challenge persistence |
| L6 — Skill marketplace + service marketplace | local static registry, versioned signed manifests, preflight + remediation + retry + execute, trace evidence, Trust Passport counts; remediation actions cover all §9A policies; §9B **native service marketplace** (`bharat_marketplace` skill+tool) as the OS-owned substrate for cab/hotel/ticket/food/grocery/services, with `ondc_beckn` as a Phase A outbound bridge only; service-booking receipts include UPI deep-link payment artifacts | no third-party developer KYC; no sandbox runtime; no signing trust chain; no real provider registry yet (mocked); no inbound Beckn-compliant endpoints exposed yet (interop direction); no PSP callback / settlement reconciliation yet |
| L7 — Intent orchestrator | deterministic alias + rule normalization, links L6 preflight → L3 execution, persisted receipts, carries labor / mediation / age-attestation fields through to the policy engine | no LLM; intent space is the five canonical templates |
| L8 — Vernacular generative UI | deterministic intent normalization across five Indian languages (Hindi, Marathi, Bhojpuri, Tamil, Bengali — script + romanized) with localized response strings (`src/phase1/vernacular.mjs`); **user-facing shell at `/shell/`** (`public/shell/`) with voice + TTS runtime planning (`src/phase1/voice-runtime.mjs`), on-device SLM runtime planning (`src/phase1/on-device-model.mjs`), Web Speech / browser SpeechSynthesis fallbacks, persona-aware greeting, per-action result cards, health-document capture card, profile passkey card, Worker alerts card, device-claim model with owner + household | no actual IndicWhisper-WASM / IndicTTS-WASM / WebGPU SLM decoder/model pack bundled yet; no IndicTrans2-WASM yet; health OCR is deterministic text normalization, not real image OCR yet; Web Push is local-notification/VAPID-pending scaffold; generative UI is action-type-specific cards, not from-scratch UI synthesis |
| Cross-cutting | Trust Passport v1 (derived + signed snapshots), integrity verifier, audit ledger, operator console, PWA shell, local identity creation, worker-notification receipts (`src/phase1/worker-notification.mjs`) | none unique to layer |

### Team and operational state (2026-05-23)

- **Delivery team:** solo founder + Claude Code. The §12 "5–8 senior
  engineers" team is a Phase 2 target, not current state. Code work is
  scoped to what one person + AI assistant can ship per session.
- **Goal at this milestone:** runnable MVP for investor pitch, not
  production deployment. Phase 2 commitments do not start until Phase 1
  surfaces are tied off (gap list below).
- **Registered entity:** yes; Bharat OS brand / domain / public identity
  not yet established.
- **Testing capability:** one spare phone (model TBC) or Android Studio
  emulator. §7e Pro-tier SLM validation needs Snapdragon 8 Gen 2+ at
  minimum.
- **Distribution path: app first, OS later.** Confirmed 2026-05-23.
  §13 Phase 2 is reordered into 2a (Android app, no OEM dependency) →
  2b (AOSP shell on OEM partner, post-funding) → 2c (multi-OEM full
  ROM). The "OS" endgame is unchanged; the bootstrap order matches what
  one person can ship pre-funding. Concrete near-term shape: wrap the
  existing operator console (`public/operator-console/` + Phase 0.3 API)
  as a PWA for the *very* first investor demo, then a native Android
  build, then AOSP shell when capital + OEM LOI land. The §7b
  "owning-the-OS" argument is intact for Phase 2b/2c; in Phase 2a, mesh
  participation is foreground/charging-only.
- **External commitments awaiting human action (not Claude Code's
  work):**
  - OEM / telco LOI (§10, §14 P0 risk) — none started.
  - AUA / KSA partnership and DPDP fiduciary registration (§7d, §12) —
    none started.
  - AA / ABHA empanelment (§12) — none started.
  - Capital raise — IndiaAI Mission grants, sovereign-tech VC (§12) —
    none started.
  - Bharat OS domain registration; brand decisions.
  - Patent counsel engagement (§14A defensive strategy) — planned.
  - Regulatory counsel for DPDP / RBI / MeitY items — planned.

### Phase 1 tie-offs — status

Closed in Phase 1.40–1.43 (ADRs 0046, 0047, 0048, 0049):
1. ✅ **NCS surfacing** — `store.computeContribution`, `GET /api/identities/:id/contribution`, `bos contribution show`, Trust Passport `mesh` block.
2. ✅ **Worker authorization receipts as signed artifact** — new `worker-authorization.mjs` module, L4 mediation policy verifies signature + workerId + expiry, `publicRecords` threaded through evaluation chain.
3. ✅ **Operator console panels for 1.37–1.41 surfaces** — NCS column on Trust Passports, §9B Service Marketplace panel, §9A Worker Authorizations panel with per-row verify.
4. ✅ **CLI commands** — `bos service book`, `bos vernacular normalize|languages`, `bos worker-auth create|list|verify`, `bos device recovery-phrase|verify-phrase|pair`.
5. ✅ **Device-pairing scaffold** — `device-pairing.mjs` with deterministic recovery phrase and pairing payload. Hardening (real ephemeral-key handshake, full BIP-39 wordlist) is Phase 2b.
6. ✅ **PWA conversion of the operator console.** Manifest, service worker, offline app shell. The Phase 2a §13 distribution path is runnable on a phone.
7. ✅ **Phase 1.43: user-facing vernacular shell at `/shell/`** (`public/shell/`). Voice-first or text, persona-aware, per-action result cards rendering vernacular `localizedResponse`. **Device-claim model:** owner + household stored in localStorage; demo personas re-initialize the device rather than masquerading as same-device profiles. English-vs-Hinglish intent detection corrected so pure-ASCII English doesn't get mis-classified as `hi-Latn-IN`.

Closed in Phase 2a.1 (ADR 0050):
1. ✅ **UPI deep-link for service bookings** — `bharat_marketplace` and `ondc_beckn` receipts now include a `payment` artifact with a `upi://pay?...` URI, and `/shell/` renders a `Pay with UPI` action on service-booking result cards. This is a handoff only: no PSP callback, reconciliation, or payment-status verification yet.

Closed in Phase 2a.2 (ADR 0051):
1. ✅ **Health document capture -> mocked ABHA structured upload** — `health-document.mjs`, `bos:skill:abha-document-upload`, `POST /api/health-documents`, and `/shell/` capture card. The artifact stores image metadata/hash + structured observations only; raw image and full OCR text are not persisted. Real Tesseract.js / IndicOCR image-to-text remains a hardening step.

Closed in Phase 2a.3 (ADR 0052):
1. ✅ **WebAuthn per-profile passkey binding scaffold** — `profile-auth.mjs`, `profile-credentials` store persistence, `POST /api/profile-auth/challenges`, `POST /api/profile-auth/credentials`, `POST /api/profile-auth/assertions`, and `/shell/` passkey controls. The artifact stores credential metadata + challenge linkage, not biometric material or private keys. Full FIDO2 attestation/assertion signature verification and replay-proof challenge persistence remain hardening steps.

Closed in Phase 2a.4 (ADR 0053):
1. ✅ **Web Push worker notification scaffold** — `worker-notification.mjs`, `push-subscriptions` + `worker-notifications` store persistence, `GET/POST /api/push/subscriptions`, `GET/POST /api/worker-notifications`, service-worker `push`/notification-click handlers, and `/shell/` Worker alerts controls. The scaffold stores endpoint hashes/key-presence metadata, not raw Push endpoints or keys. Real VAPID delivery, retries, unsubscribe handling, and production push-service integration remain hardening steps.

Closed in Phase 2a.5 (ADR 0054):
1. ✅ **Indic voice runtime scaffold** — `voice-runtime.mjs`, `voice-model-packs` store persistence, `GET /api/voice/runtime`, `GET/POST /api/voice/model-packs`, and `/shell/` runtime planning for active-profile locale. The plan prefers installed Indic Whisper WASM packs, falls back to Web Speech in secure contexts, and otherwise leaves text input as the safe path. Real WASM decoder/model-pack delivery remains open.

Closed in Phase 2a.6 (ADR 0055):
1. ✅ **Indic TTS runtime scaffold** — `voice-runtime.mjs` now also covers `tts-model-packs`, `GET /api/tts/runtime`, `GET/POST /api/tts/model-packs`, and `/shell/` Listen controls for localized responses. Browser `speechSynthesis` is the demo playback path until IndicTTS-WASM / Bhashini SDK integration lands.

Closed in Phase 2a.7 (ADR 0056):
1. ✅ **On-device SLM runtime scaffold** — `on-device-model.mjs`, `on-device-model-packs` persistence, `GET /api/on-device/runtime`, `GET/POST /api/on-device/model-packs`, and shell orchestration metadata for local model readiness. Current inference remains deterministic until a WebGPU / llama.cpp.wasm model pack is installed.

Closed in Phase 2a.8 (ADR 0057):
1. ✅ **Tesseract.js wired for real Indic OCR** — eng/hin/tam language data lazy-loaded from CDN on first health-document capture; cached after; auto-fills the OCR text area; falls back to manual textarea if offline. Deterministic structured field extraction (HbA1c, BP, meds, follow-up) on top of the OCR output.

Closed in Phase 2a.9 (ADR 0058):
1. ✅ **§9A flag report ledger** — `src/phase1/flag-report.mjs` (signed by the reporter), `policy.report.flag_review_threshold` auto-blocks any subject with ≥ 3 open high-severity flags, `/api/flags*` routes, `bos flag` CLI, and a shell card to file reports. Operator console gained a flag-review panel to resolve / dismiss.

Closed in Phase 2a.10 (ADR 0059):
1. ✅ **App handoff for cab/hotel/ticket/food/grocery** — `APP_HANDOFF_REGISTRY` in `src/phase1/tools.mjs` plus shell result-card chips. Transparent handoff via deep links (uber://, olacabs://, makemytrip://, swiggy://, …); §15 binding preserved (no scraping, no impersonation).

Closed in Phase 2a.11 (ADR 0060):
1. ✅ **Operator console flag-review panel** — surfaces pending high-severity reports, lets a reviewer resolve / dismiss with a signed evidence trail.

Closed in Phase 2a.12 (ADR 0061):
1. ✅ **Real on-device SLM via transformers.js** — `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (~120 MB) running entirely in-browser via WASM. User-triggered warm-up + visible progress + IndexedDB cache. Real cosine-similarity intent classification across six canonical action templates; surfaces top action + scores in the flow card. Tier 4 generative SLM (Sarvam-1 q4 / Gemma 2 q4) remains opt-in future work.

Closed in Phase 2a.13 (ADR 0062):
1. ✅ **L2 mesh contribution loop** — `src/phase1/mesh-contribution.mjs` with signed contribution events (inference + storage_serve + storage_store), per-event operator payout computed from §13B rates, persistence + ledger, `/api/mesh/contributions*` routes, `store.computeContribution` now folds events into NCS dynamically, and a `/shell/` **Mesh node** card with a live earnings ticker (8s ticks). Periodic Background Sync registered best-effort for hidden-tab continuation.

Closed in Phase 2a.14 (ADR 0063):
1. ✅ **§7c WebRTC device-pairing real handshake** — `src/phase1/pairing-session.mjs` (signed session lifecycle: pending → claimed → completed/expired with 6-digit claim code), `/api/pairing/sessions*` as signaling-only relay (server never sees the identity bundle), and a real `RTCPeerConnection` + `RTCDataChannel` handshake in `public/shell/pairing.mjs`. The shell pairing card lets the old device start a session (shows the code) and the new device claim it (enters the code, receives the bundle browser-to-browser, adds it to its household). §15 binding: server only sees SDP + claim code, identity transits the data channel directly.

Closed in Phase 2a.15 (ADR 0064):
1. ✅ **Shell polish pass** — reordered `/shell/` so the intent loop and the live §13B mesh ticker sit above the fold; auxiliary surfaces (pairing, passkey, alerts, health document, §9A flag report) collapsed into a single "More controls" `<details>` block with a meta line that lists what's one click away. No behavioural change; HTML + CSS only. Service worker cache bumped to v11.

Closed in Phase 2a.16 (ADR 0065):
1. ✅ **Demo readiness pass** — suggestion chips expanded to six per locale covering four action types (loan, cab, health record, hotel, scheme, train); Hinglish loan regex hardened to match `karza` / `karzaa` / `karja` / `business` / `nbfc` and the Devanagari side extended with कारोबारी / कारोबार / व्यवसाय (no more silent mis-classification as `mesh_storage`); first-run onboarding overlay shown once per browser with three coach-mark steps (intent → mesh ticker → more controls + diagnostics) and a *Replay tour* link in More controls. SW cache to v12.

Closed in Phase 2a.17 (ADR 0066):
1. ✅ **§7c encrypted vault transfer** — `src/phase1/vault-transfer.mjs` canonical artifact with `createVaultBundle` / `decryptVaultBundle` (AES-GCM-256 under PBKDF2-HMAC-SHA-256(phrase, 200k iters, 16-byte random salt)). New `/api/identities/:id/recovery-phrase` + `/api/identities/:id/vault-snapshot` endpoints; the snapshot endpoint carries an explicit demo-only `warning` (production Phase 2b keeps the privateKeyPem in the device hardware keystore). Pairing bundle bumped `v0 → v1` carrying both `publicIdentity` + `encryptedVault`; the recovery phrase never crosses the wire; receiver prompts the user with up to three attempts; wrong phrase fails via GCM auth-tag rejection. Module aliased at `/shell/vault-transfer.mjs` so the browser imports the same canonical file the tests cover (no duplication). Backward-compatible — older bundles without `encryptedVault` still claim as public-only. 210 / 210 tests (+9 new). SW cache to v13.

Closed in Phase 2a.18 (ADR 0067):
1. ✅ **§9C vignette coverage — `trust_attestation` + `daily_brief`** — closes the §9C user-facing gap (16 / 18 → 18 / 18). Two new action types, tools (`trust_passport_attestation`, `daily_brief_compose`), skills, orchestration templates, vernacular aliases across all six languages + English (en-IN / hi-IN / hi-Latn-IN / mr-IN / bho-IN / ta-IN / bn-IN), and shell rendering. Trust attestation = §13A #7 Trust-as-a-service: signed time-bound envelope with band-or-boolean selective disclosure (raw PII never exposed, `shareDays ∈ [1, 90]`, verifier pays). Daily brief = §9C vignette 16b: on-device only (`runtime: 'on_device_only'`, `networkLegs: 0`, `horizonHours ∈ [1, 168]`), citizen-facing with no revenue line. 220 / 220 tests (+10 new). SW cache to v14.

Closed in Phase 2a.19 (ADR 0068):
1. ✅ **Daily brief on-device composer** — `src/phase1/daily-brief.mjs` with `gatherDailyBriefSignals` (reads orchestrations / mesh events / expiring consents / open §9A flags from the active profile's records, horizon-bounded) + `renderDailyBrief` (locale-aware template renderer producing vernacular text in en-IN / hi-IN / hi-Latn-IN / mr-IN / bho-IN / ta-IN / bn-IN with greeting / mesh / recent / consents / §9A-flag sections + a §7e on-device footer in every locale). Orchestration API auto-gathers signals for `daily_brief` requests and threads them via `metadata.signals`; tool adapter embeds the rendered brief on the receipt with `renderer: 'template_v0'` + an explicit `rendererNote` that names the Tier 4 SLM swap. Shell renders the brief text in a `<pre class="daily-brief-body" lang="…">` block above the metadata grid. 228 / 228 tests (+8 new). SW cache to v15.

Closed in Phase 2a.20 (ADR 0069):
1. ✅ **Trust Passport shell card** — new *"🛡️ Trust Passport — what a verifier would see"* card sits above-the-fold with four tiles (attestations, active consents, NCS class, §9A flags) and a *"Show me what a landlord would see"* preview that renders the band-or-boolean selective-disclosure envelope inline before any attestation is minted. `createTrustPassport` artifact gains a `flagReports` block (`total / open / openHighSeverity / resolved / dismissed`) so the §9A safeguard escalation (ADR 0058) is finally user-visible in the passport itself. `trustPassportContext` threads `flagReports` from the store; `canonicalTrustPassportPayload` includes the block so signed snapshots cover it. 230 / 230 tests (+2 new). SW cache to v16.

Closed in Phase 2a.21 (ADR 0070):
1. ✅ **QR-code pairing** — collapses the §7c receiver flow from *"type 6-digit code + read 12 words aloud + type 12 words"* into a single scan. Initiator renders a QR encoding `{ v: 'bos.qr.v1', code: '<6 digits>', phrase: '<12 words>' }` next to the existing code + phrase display (qrcode lib lazy-loaded from esm.sh same as transformers.js / tesseract). Receiver gets three claim paths in priority order: 📷 Scan QR (native `BarcodeDetector` API + rear-camera `getUserMedia`), 📋 Paste QR text (fallback for browsers without `BarcodeDetector`), and the existing typed-code path. `claimPairingFromCode({ prefilledPhrase })` uses the QR-supplied phrase on attempt 0 and falls back to the manual prompt on rejection. Backward-compatible: older initiators / receivers still work. 230 / 230 tests. SW cache to v17.

### Phase 2a queue — what's PWA-buildable next (no OEM, no funding gate)

§13 makes explicit that ~85% of §6 is PWA-buildable. This is the
prioritized queue of features that close the gap between the current
deterministic-mock shell and a production-feel PWA. None of these need
the OS layer.

| # | Feature | Effort | Notes |
|---|---|---|---|
| 1 | ✅ **UPI deep-link** in `service_booking` execution result | done | `upi://pay?pa=…&pn=…&am=…&tn=…` opens the user's UPI app from the result card. No partner integration; settlement confirmation is still open. |
| 2 | ✅ **Document capture → OCR → ABHA structured upload** (§9C 16a) | real | **Tesseract.js wired (Phase 2a.8)** — eng / hin / tam language data lazy-loaded from CDN on first capture; auto-fills the OCR text area; falls back to manual textarea if offline. Deterministic structured field extraction (HbA1c, BP, meds, follow-up). Mocked ABHA upload. Still open: language-specific extraction patterns for non-English prescriptions. |
| 3 | ✅ **WebAuthn per-profile biometric** (§9A design problem A) | scaffold done | `navigator.credentials.create / get` binds a passkey per profile in the shell, backed by challenge evidence and profile-credential persistence. Still open: full FIDO2 verification + replay-proof challenge persistence. |
| 4 | ✅ **Web Push** for §9A worker notifications | scaffold done | Installed-PWA permission + service-worker local notifications + persisted worker-notification receipts. Still open: VAPID send path, retries, unsubscribe handling. |
| 5 | ✅ **Real Indic voice** via **IndicWhisper-WASM** (replaces Web Speech API) | scaffold done | Runtime planning + model-pack metadata are live. Still open: actual WASM decoder/model download, microphone streaming, Android latency tests. |
| 6 | ✅ **Real Indic TTS** via **IndicTTS-WASM** or Bhashini JS SDK | scaffold done | TTS runtime planning + model-pack metadata + shell Listen controls are live. Still open: decoder/model delivery, Bhashini SDK evaluation, voice selection, Android latency tests. |
| 7 | ✅ **On-device SLM** via WebGPU + **transformers.js / llama.cpp.wasm** | real (Tier 3) | **Phase 2a.12 wired transformers.js + `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (~120 MB)** running entirely in-browser via WASM. User-triggered warm-up + visible progress + IndexedDB cache. Real cosine-similarity intent classification across the six canonical action templates; surfaces top action + scores in the flow card. Tier 4 generative SLM (Sarvam-1 q4 / Gemma 2 q4) at 1.5–4 GB remains opt-in future work. ADR 0061. |
| 8 | ✅ **WebRTC §7c device-pairing transport** | real | **Phase 2a.14** ships `src/phase1/pairing-session.mjs` (signed session lifecycle: pending → claimed → completed/expired with 6-digit claim code), API at `/api/pairing/sessions*` as signaling-only relay (server never sees the identity bundle), and a real `RTCPeerConnection` + `RTCDataChannel` handshake in `public/shell/pairing.mjs`. The shell pairing card lets the old device start a session (shows the code) and the new device claim it (enters the code, receives the bundle browser-to-browser, adds it to its household). ADR 0063. |
| 9 | ✅ **L2 mesh contribution loop in the PWA** | real (foreground) | **Phase 2a.13** adds `src/phase1/mesh-contribution.mjs` with signed contribution events (inference + storage_serve + storage_store), per-event operator payout computed from §13B rates, persistence + ledger, `/api/mesh/contributions*` routes, `store.computeContribution` now folds events into NCS dynamically, and a `/shell/` **Mesh node** card with a live earnings ticker (8s ticks). Periodic Background Sync registered best-effort for hidden-tab continuation. ADR 0062. |
| 10 | **ONDC sandbox real integration** (replace `ondc_beckn` mock) | depends on partner | Awaiting ONDC sandbox credentials. The Beckn HTTP calls themselves are the same on PWA or native. |
| 11 | **DigiLocker / AA / ABHA real OAuth flows** | depends on partner | Public OAuth redirects work in PWA the same as native. Need AUA/KSA partner + DPDP fiduciary registration first (§12). |
| 12 | **Federated learning round** via TensorFlow.js or ONNX Runtime Web (§7f) | large | Phase 3 commitment in §7f; technically PWA-buildable. |
| 13 | ✅ **One-tap reporting + flag ledger** (§9A safeguard escalation) | done | `flag-report.mjs` signed by the reporter; `policy.report.flag_review_threshold` auto-blocks subjects with ≥ 3 open high-severity flags until human review. API + CLI + shell card. ADR 0058. |

### Footprint accounting — "is this too heavy for mobile?"

Honest tier accounting so an investor / partner can answer the heaviness
concern in one paragraph:

| Tier | What | Size | Loaded when |
|---|---|---|---|
| **1 — Always** | PWA app shell (HTML + JS + CSS + service worker + icon + manifest) | **~50 KB compressed** | First load, cached forever |
| **2 — Lazy on first need** | Tesseract.js core + Hindi + English + Tamil language data | ~7 MB | First time the user taps "Camera" for a health document; cached after |
| **3 — Opt-in offline voice** | IndicWhisper-WASM tiny model + decoder | ~30 MB | Only if user enables offline voice (Phase 2a queue #5 runtime, currently scaffold) |
| **4 — Opt-in flagship-only** | On-device SLM (Sarvam-1 q4 7B, or Gemma 2B q4) | 1.5–4 GB | Explicit opt-in, Snapdragon 8 Gen 2+ / Tensor G3+ only (Phase 2a queue #7, currently scaffold) |

**The base demo footprint is ~7 MB.** That is lighter than the Uber rider
app (~150 MB), WhatsApp (~100 MB), or the average Android app (~30–50 MB).
Bharat OS as a PWA is the *lightest* way a phone gets this functionality,
not the heaviest — Tiers 3–4 are opt-in sovereignty upgrades, not the
default load. This is a talking point with investors, not a constraint.

The shell exposes this honestly through a "What's running, what's
scaffold" diagnostics panel at the bottom of `/shell/` so the heaviness
question can be inspected interactively during a demo.

### Phase 2b minimum — what genuinely needs the OS layer

The remaining ~15%. Everything in this list is why §13 Phase 2b ships
an AOSP shell on an OEM partner. Nothing else in §6 requires it.

- **Persistent mesh node daemon** — survives Android Doze, runs as a
  system service, lets the §13B compute / storage spread work
  continuously. The §7b "owning-the-OS fixes mobile DePIN" line.
- **Launcher / home-screen replacement** — so Bharat OS *is* the phone.
- **System-wide intent capture** — wake word at the assistant layer,
  not gated by Google Assistant.
- **TEE attestation at the OS level** (Knox / StrongBox / QSEE) — §12
  6–9 month engineering pole.
- **Syscall-level L4 enforcement** — policy at the kernel boundary,
  not just inside the Bharat OS process.

### Observations carried forward as risks
- **L8 is the product promise; only the deterministic normalizer exists.** §1
  leads with vernacular generative UI in 22 languages. Closing this is
  multi-quarter work and depends on real Bhashini / IndicX integration plus a
  generative UI renderer. The vernacular module is the seam where that work
  lands.
- **L1 / L2 hard parts are unblocked but untouched.** §12 calls out
  TEE-backed attestation as the 6–9 month engineering pole. No work has started
  on AOSP fork, node daemon, or attestation.
- **Phase 1 risks over-fitting the simulator.** Recent ADRs stack receipt /
  integrity / trace surface on the same mocked tools. The next real-signal
  increments need a real partner (AUA / DigiLocker sandbox) or one real
  TEE-attested device — not more polish on the inner shell.
- **§14 P0 risks are still open.** No first-1,000-nodes demand test on real
  devices; no OEM / telco LOI; no AUA / DPDP / AA empanelment under way.
- **§9A labor flow — partially closed.** The L4 policy engine now enforces the
  no-advance-fee, escrow, minimum-wage-floor, age-verification, kiosk
  mediation, and fiat-only rules; remediation hints guide callers to fix
  blocks, and mediated actions now require a signed worker authorization
  artifact. Per-profile passkey binding is scaffolded, but still needs full
  FIDO2 verification and replay protection. Worker alerts are scaffolded, but
  still need real VAPID delivery and unsubscribe/retry handling. Still open:
  (1) device-less assisted/kiosk channel (identity layer work, not policy);
  (2) one-tap reporting and human-review workflow for §9A safeguards; (3) NGO
  / labour-law partner engagement; (4) real-world compliance testing beyond
  mocked flows.
- **L6 marketplace economics absent.** No KYC'd developer onboarding, no
  installer / sandbox, no signing trust chain — the §13A "network-effect
  revenue" line has nothing to stand on yet.
- **NCS / fair-use lever is visible but not economic yet.** §7b / §13B make
  Net Contribution Score load-bearing for the demand-side story; Phase 1 now
  surfaces it through API, CLI, Trust Passport, and console views. Still open:
  settlement pricing, credit accounting, abuse controls, and real node telemetry.

### Useful entry points (read this if you are picking up the work)

**The doc itself:**
- `BHARAT_OS.md` — this canonical reference. §0 (independence), §6
  (architecture), §15 (constants) are binding. §17 (this section) is
  the up-to-date status board; check it before assuming anything.
- `README.md` — phase-by-phase build log (1.0 → 2a.7).
- `docs/adr/` — 56 ADRs numbered chronologically. Most recent
  (0046–0056) describe Phase 1.40–1.43 and Phase 2a.1–2a.7.
- `docs/phase0/`, `docs/phase1/`, `docs/ui/` — implementation notes.

**The code:**
- `src/BharatOS.Phase0/` — original PowerShell executable spec.
- `src/phase0/core.mjs` — identities, signing, mesh primitives, NCS,
  encrypted objects.
- `src/phase0/store.mjs` — local file-system store; also exposes
  `computeContribution`.
- `src/phase0/api.mjs` — local HTTP API + static serving of `/shell/`
  and `/console/`.
- `src/phase0/simulate.mjs` — Phase 0 bootstrap simulator.
- `src/phase1/policy.mjs` — L4 policy engine + consent;
  `evaluateDecision` takes `publicRecords` for §9A signature checks.
- `src/phase1/tools.mjs` — L3 mocked adapters + `bharat_marketplace`
  (L6 native) + `ondc_beckn` (Phase A bridge).
- `src/phase1/skills.mjs` — L6 skill registry, preflight, remediation.
- `src/phase1/orchestrator.mjs` — L7 orchestrator. Six action
  templates (regulated_onboarding, scheme_delivery, health_record_read,
  labor_match_post, mesh_storage, service_booking).
- `src/phase1/vernacular.mjs` — L8 normalizer (hi / mr / bho / ta / bn)
  + localized response phrases.
- `src/phase1/memory.mjs` — L5 identity-anchored encrypted memory.
- `src/phase1/integrity.mjs` — canonical payloads + signing for every
  signed artifact.
- `src/phase1/trust-passport.mjs` — derived Trust Passport with mesh
  block (NCS), signed snapshots.
- `src/phase1/worker-authorization.mjs` — §9A signed receipt verified
  by the L4 mediation policy.
- `src/phase1/device-pairing.mjs` — §7c scaffold (Phase 2b hardens).
- `src/phase1/profile-auth.mjs` — Phase 2a.3 per-profile passkey
  challenge and credential metadata scaffold.
- `src/phase1/worker-notification.mjs` — Phase 2a.4 worker alert
  subscription metadata and notification receipts.
- `src/phase1/voice-runtime.mjs` — Phase 2a.5/2a.6 Indic ASR/TTS
  runtime planning and local model-pack metadata.
- `src/phase1/on-device-model.mjs` — Phase 2a.7 local SLM runtime
  planning and model-pack metadata.
- `bin/bos.mjs` — comprehensive CLI (~30 commands).
- `bin/bos-api.mjs` — local HTTP API server entry.

**The user-facing PWA surfaces:**
- `public/shell/` — **Bharat OS user shell** (Phase 2a.7). Voice-first,
  vernacular, persona-aware, device-claim model (owner + household),
  health-document capture, profile passkey controls, Worker alerts, voice
  + TTS + on-device SLM runtime planning, PWA-installable. The surface a
  user actually interacts with.
- `public/operator-console/` — operator / dev observability UI (NOT
  consumer-facing). PWA-installable as a separate app.

**Demo / dev:**
- `scripts/seed-demo.mjs` — populates a demo store with the §9C
  vignettes (Sita / Ravi / Lakshmi / Aarav / Suresh / Priya / Rajesh /
  Anjali). Run once, then start the API on the demo store.
- `scripts/test.ps1`, `scripts/bos.ps1`, `scripts/api.ps1` — PowerShell
  wrappers (use the portable Node in `.tools/`).
- `tests/node/` — 20 test files, 162 tests, all green.

### How to run the demo locally
```
# 1. Seed a demo store with §9C vignettes
node scripts/seed-demo.mjs

# 2. Start the API on that store
node bin/bos-api.mjs --store .demo-bharat-os --host 0.0.0.0 --port 8787

# 3. Open in browser:
#    http://127.0.0.1:8787/         user-facing shell (PWA)
#    http://127.0.0.1:8787/console/ operator console (admin)

# 4. (Optional) Side-load to your phone on the same WiFi:
#    http://<laptop-LAN-IP>:8787/   "Add to Home screen" in Chrome
```

### How to pick up the work (notes for Codex or a fresh contributor)

1. Read `BHARAT_OS.md` §0, §6, §15, §17 first. §17 is the live status
   board.
2. Run the test suite: `node --test tests/node/*.test.mjs`. Should be
   162/162 green.
3. Run the demo (above). Inspect both `/shell/` and `/console/`.
4. Pick a feature from the **Phase 2a queue** in §17. The queue is
   prioritized; the smaller items at the top are 1–2 session efforts.
5. Each substantial change gets a new ADR in `docs/adr/` numbered
   sequentially.
6. Update §17 inline as items close. Do not create a parallel status
   doc; §17 is the canonical place (§16).
7. Tests are mandatory for new behavior in `src/phase1/` modules.
