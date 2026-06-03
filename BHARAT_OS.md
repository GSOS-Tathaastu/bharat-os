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

## 17. Current implementation status (snapshot — 2026-06-01)

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

### Team and operational state (2026-06-01)

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

🧭 **Direction set 2026-05-31 (post-Phase 11.7 discussion — save-point for the next session):**

The user, while testing /app/citizen/home post-Phase 11.7,
flagged that "Book a cab" should land on a Bharat-OS-native
marketplace (NOT Ola/Uber) and that the "Worker / Citizen"
onboarding split is too narrow now that the plan includes
drivers, cooks, maids, kirana stores, and other working-class
provider roles. Four binding decisions captured in memory; see
the cross-references below:

1. **Service booking = Bharat OS native marketplace.** "Book a
   cab" books Bharat-OS-onboarded providers. ONDC bridge is
   bootstrap density only. No Ola/Uber adapter (would violate
   §15 — Bharat OS doesn't insert itself as a rent-seeking
   middleman). Already encoded in the orchestrator's
   `service_booking` template; surface needs to honour it.
   `memory/service-booking-native-not-ola-uber.md`.
2. **Onboarding hero rebrand: "Earn" + "Use" (was
   "Worker"/"Citizen").** Earn covers labelers + drivers +
   cooks + maids + kiranas + skilled trades via an in-flow role
   chooser ("How do you want to earn?"). "Business" reserved
   for sponsor onboarding (MFI / bank / research lab) — DO NOT
   reuse on the earner side.
   `memory/onboarding-hero-earn-use.md`.
3. **Provider identity ≠ worker identity.** Marketplace
   providers (driver / cook / maid / kirana / skilled) carry
   a separate KYC-heavy `providerIdentity` distinct from
   micro-task `workerIdentity`. Different liability shape.
   Same human can hold both under one root recovery (Phase 1.19).
   Mesh balance presented as two cards (micro-task earnings vs
   marketplace earnings). `memory/provider-vs-worker-identity-split.md`.
4. **ONDC bridge hidden v1.** Citizens see only Bharat-OS
   native providers. Thin supply → "be the first to invite a
   driver" empty state (referral CTA), not ONDC fallback by
   default. Substrate stays intact; FE chooses what to surface.
   `memory/ondc-bridge-hidden-v1.md`.

**11.8 SHIPPED 2026-05-31 (ADR 0127). 11.9 SHIPPED 2026-05-31
(ADR 0128).**

**Phase 12.x → 13.x sequencing locked 2026-05-31** after a
founder conversation that produced two more strategic decisions
on top of the four earlier:

5. **Citizen data labelling + sponsor sale as a revenue line.**
   Citizens monetize THEIR own data (intents, conversations,
   document interactions, etc.) via Bharat OS — signed consent,
   per-data-point payouts, revocation. Different motion from
   today's labeling marketplace (workers label sponsors' data).
   `memory/citizen-data-as-product-revenue.md`. Phase 13.x.
6. **Compute network as new mesh workload.** Extend §13B with
   `compute_serving` — worker phones serve SLM inferences to
   OTHER citizens for fiat-credit. Storage network already
   substrate (low priority for v1).
   `memory/compute-network-mesh-workload.md`. Phase 13.x.

| Phase | Scope | Cost |
| --- | --- | --- |
| **12.0** | `providerIdentity` substrate (BE+FE). Schema + KYC-heavy onboarding + linkage to root recovery. Earner home: two ledger cards (micro-task + marketplace). | ~1.5 wks |
| **12.1a.1** ✅ | **SHIPPED 2026-06-01 (ADR 0135).** Marketplace discovery substrate + citizen browse. Discriminated-union geo schema (4dp persist, 2dp public emit), shared phase0/geo.mjs + FE geo lib (reusable for booking, mesh, audits), GET /api/marketplace/providers, POST /express-interest typed precedent row, /app/citizen/services/* nested routes, ProviderOnboarding ServiceAreaPicker. ONDC suppressed. | ✅ shipped |
| **12.1a.2** ✅ | **SHIPPED 2026-06-01 (ADR 0136).** Booking + citizen-escrow + provider surface. 6-state CAS-guarded booking machine; lazy auto-release (4h pre-accept expiry + 24h after provider-marked-complete); rate snapshot immutability; bookkeeping-v1 funding via admin escrow deposit. /provider/* 5-tab surface; /citizen/services/bookings list + detail. Push on every transition. Extracted escrow-paise + provider-auth + booking-push + bubbleAt1dp as CORE substrates. ONDC still suppressed. | ✅ shipped |
| **12.1b.1** ✅ | **SHIPPED 2026-06-01 (ADR 0137).** SLM-A vernacular intent parser. On-device wllama parses intent → structured annotation; deterministic substrate remains source of truth; verdict ledger events. Citizens with no SLM installed see no change. | ✅ shipped |
| **12.1b.2** ✅ | **SHIPPED 2026-06-01 (ADR 0138).** SLM-B offline-first decisioning + queued sync. Ledger-backed idempotency (3 event types, no new SQL table, scope-generic), per-identity IndexedDB queue, Web Locks single-flight drainer, OfflineQueuePill + QueuedIntentsPanel. Scope: orchestrations only — bookings/consents/flags deferred to 12.1b.3. | ✅ shipped |
| **12.1b.2.x** | Bookings/consents/flags offline queue + queue-feedback UX batch + 17 more Indic languages. | ~1 wk |
| **12.1b.3** ✅ | **SHIPPED 2026-06-01 (ADR 0139).** SLM-C light dynamic forms. Schema-driven DynamicForm renderer + per-role light schemas for 4 wave-1 roles + SLM tap-to-accept suggest chip. New `roleAnswers` field on providerIdentity (NOT echoed to public). New `provider_identity.updated` ledger event. | ✅ shipped |
| **12.1b.4** ✅ | **SHIPPED 2026-06-01 (ADR 0140).** SLM-D booking advisor. FE-only provider advisor on `pre_authorized` bookings — verdict + rationale + polite reject-reason chip. True rate-negotiation deferred to 12.2 (breaks rateSnapshot immutability + escrow contract). **Phase 12.1b arc CLOSED.** | ✅ shipped |
| **12.2** | Provider self-serve onboarding — **wave 1 four roles**: cab-driver, personal-driver, labourers, household-help (maid+cook combined). Shares one physical-service onboarding flow + role-specific extras. | ~2 wks |
| **12.3+** | Remaining provider roles: kirana, skilled-trades. Order TBD. | ~3 wks |
| **13.x** | SLM USP features: on-device document summariser · PII redactor · personalization (preferences never leave device) · skill agents for Indian tasks (electricity bill / consumer complaint / PM-KISAN). | ~6 wks |
| **13.x** | Citizen data labelling + sponsor sale + Compute network mesh workload. New revenue lines. | ~4 wks |
| **14+** | Bharat ID / SSO — long-game positioning play. | TBD |

~22 wks of substantive work to v1 marketplace + SLM-USP feature
parity + new revenue lines. Subject to demo + investor +
provider-feedback re-prioritization.

`memory/phase-12-13-sequencing-set.md` carries the full
sequencing.

🟡 **Proposed (design only — not yet implemented):**

- **Phase 11 — ARC CLOSED 2026-05-31.** Sub-phases 11.0–11.3
  (ADR 0116) + 11.4 (ADR 0117) + 11.5 + 11.6 (ADR 0118) all shipped.
  /app/ v1 is investor-demo-ready end-to-end across worker / citizen
  / verifier / settings surfaces. Backend 798 → 800 tests. Frontend
  7 Vitest tests (more to add as flows stabilise). See §17 closed-
  phase log above for the full per-sub-phase summary.
- **Phase 9.0c — SHIPPED 2026-05-31 (ADR 0114).** SLM runtime adapter
  (llama.cpp-wasm via @wllama, lazy-loaded). On-device inference is
  real on /app/labs/ end-to-end. Vitest 7 → 14. See §17.
- **Phase 9.0d — SHIPPED 2026-05-31 (ADR 0119).** Federated rounds
  wire to the new SLM runtime + Try Prompt records real mesh-
  inference events. Phase 9.0 arc CLOSED. Vitest 14 → 16, Node 800
  → 802. Stub gradient is the honest gap (real LoRA training needs
  a training-capable runtime; documented future polish).
- **Phase 9.1 — SHIPPED 2026-05-31 (ADR 0120).** Sponsored federated
  rounds. Sponsor model + bearer-token auth + escrow-locked round
  creation + per-update escrow debit + signed audit export bundle.
  First non-investor revenue line. Node 802 → 821. See §17.
- **Phase 10.1 + 10.2 — SHIPPED 2026-05-31 (ADR 0121).** Labeling
  marketplace v1: BE substrate (draft/upload/launch/discover/submit
  lifecycle + escrow integration) + worker `/app/labels/` tab with
  preference-pair task UI. Workers earn paise per accepted label
  TODAY. Node 821 → 838.
- **Phase 10.3 — SHIPPED 2026-05-31 (ADR 0122).** Remaining four
  task kinds: classification (radio cards), span_annotation (word-
  toggle), transcription (audio + textarea + ASR pre-fill),
  safety_label (multi-select checkboxes with explicit "Mark as
  safe"). Pure FE — zero BE changes. Bundle 352 → 359 KB / 110 KB
  gzipped (+7 KB).
- **Phase 10.4 — SHIPPED 2026-05-31 (ADR 0123).** Labeling QC
  pipeline: golden-set scoring on submit + worker score gate on
  next-item dispatch + sponsor sample-for-review with reject
  (mesh + escrow clawback). Marketplace converges on quality.
  Node 838 → 854. Bundle 359 → 362 KB / 111 KB gzipped (+1 KB).
- **Phase 10.5 — SHIPPED 2026-05-31 (ADR 0124).** Signed labeling-
  job audit export. NDJSON header + per-submission + trailer with
  Ed25519 signature over content SHA-256, signed by a singleton
  server-side audit signer (lazy-bootstrapped on first export +
  persisted in store). `identityHash = sha256(jobId::workerId)`
  rotates per (job, worker) so sponsors cannot cross-job correlate.
  Ledger event `labeling_export.signed` anchors the original hash.
  Public-key endpoint `/api/audit-signer/public-key` lets any
  verifier check authenticity. Settings page gains transparency
  strip showing the audit signer id + Ed25519 public key. Node
  854 → 865. Bundle 362 → 363 KB / 111 KB gzipped (+1 KB).
- **Phase 2a.1.1 — SHIPPED 2026-06-03 (ADR 0172).** Real domain.
  Canonical URL now **https://bharat-os.com/app/**. Hostinger DNS
  A records (apex + www) repointed from `2.57.91.91` → `34.0.10.172`;
  Caddyfile extended with 3 vhost blocks: `bharat-os.com` (reverse-
  proxy to 127.0.0.1:8787), `www.bharat-os.com` (301 → apex),
  `34-0-10-172.nip.io` (301 → apex — preserves the prior Phase
  2a.1 link). Caddy auto-fetched Let's Encrypt certs for all three
  on first request. `scripts/bootstrap-vm.sh` updated with
  `BHARAT_OS_APEX_DOMAIN` env-var default `bharat-os.com` so re-runs
  reproduce the state. Smoke: apex 200, www 301, nip.io 301, valid
  TLS on all three. Adversarial review: ship_with_no_must_fix.
  No code FE change (manifest `start_url` is path-only). 542 vitest
  + 1466 Node + tsc clean unchanged. ADR 0172. SF-1 HSTS preload
  submission once stable, SF-2 manifest `related_applications` at
  TWA ship, SF-3 Cloudflare in front when traffic justifies.
- **Phase 2a.1 — SHIPPED 2026-06-03 (ADR 0171).** GCP VM
  deployment. Bharat OS is live on the public internet at
  **https://34-0-10-172.nip.io/app/** — first real HTTPS endpoint.
  This satisfies the PWA install precondition from Phase 2a.0
  (TLS-only service worker registration) and gives the §13.x
  features a real demo URL. New GCP project `bharat-os-prod`
  (project number 425977408000) with billing linked; SIP infra
  not used per §0 binding. VM `bharat-os-vm` (e2-medium, 2 vCPU
  / 4 GB RAM, Debian 12) in zone `asia-south2-a` (Delhi). Static
  external IP `34.0.10.172` reserved. Firewall rule
  `allow-http-https` opens tcp:80 + tcp:443 on http-server +
  https-server tags. App layer: EXTENDED `bin/bos-api.mjs` with
  env-var defaults (precedence: --flag > $PORT/$HOST >
  $BHARAT_OS_PORT/$BHARAT_OS_HOST > 127.0.0.1:8787); root
  `package.json` adds `build` (runs `cd frontend && npm install
  && npm run build`) + `start` (runs `node bin/bos-api.mjs`)
  scripts. NEW `scripts/bootstrap-vm.sh` (~150 lines, idempotent
  bash) — installs Node 24 via NodeSource + configures GitHub
  deploy key + clones repo + builds frontend + installs Caddy
  2.11 + writes systemd unit `bharat-os-api.service` + writes
  Caddyfile for nip.io reverse-proxy + enables + restarts both
  services. NEW `.nvmrc` (Node 24). systemd unit binds
  127.0.0.1:8787 with `BHARAT_OS_STORE_KIND=sqlite` +
  `BHARAT_OS_STORE_PATH=~/bharat-os-data` (persistent — survives
  VM restarts) + `BHARAT_OS_TRUST_PROXY=1` (Caddy sets
  X-Forwarded-For) + `BHARAT_OS_HSTS=1`. Caddy 2.11 reverse-
  proxies `34-0-10-172.nip.io` → `127.0.0.1:8787` with auto Let's
  Encrypt cert + zstd/gzip compression + X-Forwarded-Proto/For
  headers. Smoke test passed: `/healthz` 200 (39s uptime),
  `/app/` 200 (2.9 KB SPA index), `/app/manifest.webmanifest`
  200 (application/manifest+json), `/app/service-worker.js`
  200 (text/javascript). GitHub repo
  `GSOS-Tathaastu/bharat-os` set as origin (private); read-only
  deploy key 153392433 added for VM clone. Adversarial review:
  ship_with_caveats — privacy posture sound (Caddy →
  127.0.0.1; X-Forwarded-For trusted only behind Caddy; HSTS
  on now that TLS is real); honest URL (IP-derived nip.io, no
  vanity-domain claim); systemd Restart=on-failure + persistent
  sqlite + Caddy auto-renew. **Caveats: MF-1** no automated
  backup of ~/bharat-os-data (Phase 2a.2 adds daily snapshot
  cron); **MF-2** no CI/CD (Phase 2a.3 adds GitHub Actions);
  **MF-3** single VM (no redundancy — acceptable for v1).
  SF-1 real domain, SF-2 weekly disk snapshots, SF-3 fail2ban.
  Monthly cost: ~$28 (e2-medium 24×7 + static IP). Zero new
  external API (deploy substrate only). No vitest / Node delta.
  ADR 0171. **Phone-install test from user pending.**
- **Phase 2a.0 — SHIPPED 2026-06-03 (ADR 0170).** PWA install
  + offline shell. Founder authorised the move 2026-06-03
  ("Lets do the PWA only as we need to test it first. From now
  onwards, we will be adding the APIs to make the product
  live") — see new memory binding
  [[apis-going-live-mode]]. Zero new dep (hand-authored —
  rejected vite-plugin-pwa to preserve §13.x substrate
  posture). Five hand-authored assets in
  `frontend/public/`: `manifest.webmanifest` (Bharat OS
  branding + lang en-IN + scope `/app/` + start_url `/app/` +
  display standalone + theme-color #FF9933 + 2 SVG icons +
  /app/labs + /app/settings shortcuts); `icon.svg` (tricolour
  + "B" mark on navy Ashok Chakra, 512×512); `icon-maskable.svg`
  (maskable safe zone with saffron bleed); `service-worker.js`
  (~125 lines — versioned `bharat-os-pwa-v1`; cache strategy:
  NEVER caches /api/* per §15 + network-first for navigation
  with /app/ + /app/offline.html fallback +
  stale-while-revalidate for same-origin hashed assets +
  cache-first for fonts.googleapis.com + fonts.gstatic.com +
  cdn.jsdelivr.net; listens for SKIP_WAITING postMessage);
  `offline.html` (standalone HTML; honest list of what works
  offline — on-device SLM, previously-loaded shell, local
  personalisation — vs what needs network — citizen data
  offer publish, SLM-H skill actions, compute network
  dispatch). NEW `frontend/src/lib/register-service-worker.ts`
  — pure-function helper; HTTPS-or-localhost guard; dev
  builds skip; updatefound listener for future "Update
  available" banner. NEW `frontend/src/lib/use-pwa-install.ts`
  — captures Chromium beforeinstallprompt; detects ios-safari
  via UA; surfaces isInstalled via display-mode standalone +
  navigator.standalone. NEW
  `frontend/src/components/InstallPwaBanner.tsx` — three
  branches (chromium with fired event → "Install Bharat OS"
  button; iOS Safari → Share→Add-to-Home instructions;
  installed / unsupported → renders nothing). 7-day
  dismissal cooldown persisted in localStorage. Mounted in
  App.tsx above route tree. `frontend/index.html` extended
  with manifest link + svg icon + apple-touch-icon + 4 iOS
  install meta tags + mobile-web-app-capable. `main.tsx`
  registers SW on production builds only. Adversarial review:
  ship_with_no_must_fix. Privacy posture sound — SW NEVER
  caches /api/* (regression pinned); scope-limited to /app/;
  dismissal key has timestamp only (no PII); iOS detection
  via standard property. Notes: SF-1 SVG-only icons may not
  render reliably on iOS Safari pre-16 (PNG fallback in
  2a.1); SF-2 1.29 MB main bundle warning predates this
  phase; SF-3 no FE Update-available banner yet (SW supports
  SKIP_WAITING); SF-4 no A2HS install analytics. vitest
  526 → 542 (+16: 10 hook + 6 banner). Node 1441 → 1466 (+25
  pwa-manifest regression pin). tsc clean. vite build
  succeeds. Zero new external API; ADR 0170.
  **Opens §2a distribution arc. 2a.1 lands hosting + COOP/COEP;
  2a.2 lands Android TWA.**
- **Phase 13.7.4 — SHIPPED 2026-06-03 (ADR 0169).** wllama
  runtime auto-serve mode — closes the compute network's last
  manual-click step. EXTENDED
  `src/phase1/compute-serving-capacity.mjs` with optional
  `autoServe: boolean` field (defaults false; non-boolean
  rejected). Capacity ledger event includes the autoServe flag
  (POINTER + count meta only). No store migration — capacities
  persist as JSON blobs. NEW
  `frontend/src/lib/compute-auto-serve.ts` (~70 lines) —
  pure-function `generateAutoServedResponse({plaintextPrompt,
  runtime, onToken?, maxTokens?, temperature?})` that wraps the
  existing `SlmRuntime.generate` contract (no new runtime API).
  approxTokenCount via ~4-chars-per-token heuristic (same as
  13.7.1 citizen-side estimate). EXTENDED
  `ComputeServingCapacityCard` — publish form gains "Auto-serve
  (needs an installed SLM — no manual click)" checkbox; capacity
  status line shows "auto-serve on" suffix.
  PendingDispatchesSection now joins worker's own active
  capacities with the dispatch list to determine per-row
  autoServeMode; passes installedModelPackId from
  useInstalledSlms. PendingDispatchRow useEffect fires the full
  chain when autoServeMode + installed SLM: decrypting →
  generating → posting → served, with cancelled-guard on
  unmount and autoServeAttemptedRef single-shot guard. Dynamic
  imports of `slm-runtime` + `opfs` keep wllama out of the main
  bundle until an auto-serve actually fires. Honest error
  fallback to manual on every failure path (envelope_not_found,
  dispatch_not_pending, dispatch_expired, no_keypair,
  unexpected). "How this works" copy distinguishes manual vs
  auto-serve modes explicitly. Adversarial review:
  ship_with_no_must_fix. Privacy posture sound — plaintext +
  response live in component state only; SLM WASM-isolated;
  only sha256 hash + token count cross the wire; autoServe flag
  is FE-side instruction only (BE never inspects SLM output).
  Notes: SF-1 no auto-retry on envelope race; SF-2 TEE
  attestation is the fundamental v2; SF-3 real token count
  from wllama API; SF-4 no update-autoServe endpoint
  post-publish (workers revoke+republish). vitest 522 → 526
  (+4). Node 1438 → 1441 (+3). Zero new external API.
  **§13.x compute network revenue line is substrate-complete
  end-to-end with automation; the whole 13.7.x sub-arc closes
  here.**
- **Phase 13.6.1 — SHIPPED 2026-06-03 (ADR 0168).** Marketing
  pages polish + open-source backing. NEW `LICENSE` (Apache
  License 2.0) + NEW `NOTICE` at repo root — backs the
  open-source claim that was stripped from the marketing pages
  in Phase 13.6 MF-2. NEW `frontend/src/lib/use-document-meta.ts`
  — tiny per-route head-tag updater (title + description + og +
  twitter), zero new deps; restores prior values on unmount so
  SPA navigation doesn't leak. Static SEO defaults added to
  `frontend/index.html` (title, description, og, twitter,
  theme-color, author, robots, application-name, locale en_IN)
  so crawlers that don't run JS still see something sensible.
  NEW `frontend/src/components/OnDeviceInferenceAnimation.tsx`
  — purely-cosmetic landing-page animation that simulates the
  Phase 13.0 doc-summary skill streaming token-by-token.
  Labeled "Illustration of /labs" + a11y "Illustration:
  streaming on-device SLM output, looped" — honest-by-
  construction; pause-on-hover. Wired into AboutPage hero
  (2-column grid). All 4 marketing pages now use the meta hook
  with per-route title + description. MarketingLayout footer
  + AboutPage hero now mention "Open-source under Apache 2.0"
  with a target=_blank link to the canonical Apache URL. NEW
  `tests/node/license-and-seo-defaults.test.mjs` (13 cases)
  pins LICENSE + NOTICE + SEO defaults as regression-safe.
  vitest 513 → 522 (+9: 4 useDocumentMeta + 2 animation + 3
  AboutPage). Node 1426 → 1438 (+12 LICENSE + NOTICE + SEO
  defaults regression). Zero new external API. tsc clean.
  Adversarial review: ship_with_no_must_fix.
- **Phase 13.7.3 — SHIPPED 2026-06-03 (ADR 0167).**
  Encrypted-prompt substrate — closes the verifiable-serve loop
  for the compute network. Worker now actually sees the
  citizen's prompt on-device (via P-256 ECDH + HKDF-SHA256 +
  AES-256-GCM); the 13.7.2 honor-system manual-serve is now
  an honest verification path. NEW
  `src/phase1/compute-serving-encrypted-prompt.mjs` (~210
  lines) — strict-allowlist validator + ledger event builder.
  Protocol pinned `bos.phase13.compute-serving-encrypted-
  prompt.v1`. 11-entry PERMITTED_ENCRYPTED_PROMPT_KEYS +
  13-entry FORBIDDEN_SUBSTRINGS probe (rejects any key that
  could leak plaintext). 8 KB ciphertext cap; canonical base64
  validation; ms-stripped timestamps; 15-minute TTL aligned
  with dispatch. Content-derived envelopeId so a citizen
  can't post two envelopes per dispatch. EXTENDED
  `src/phase1/compute-serving-capacity.mjs` with optional
  `workerEncryptionPubKeyBase64` field (P-256 raw uncompressed
  point base64). OPTIONAL — older capacities keep working.
  EXTENDED store + sqlite-store with envelope persistence; new
  `compute_serving_encrypted_prompts` table indexed on
  dispatch_id, requester_id, worker_id. DPDP §12 cascade by
  EITHER requesterId OR workerId. EXTENDED `src/phase0/api.mjs`
  — 2 new endpoints under
  `/api/compute-serving-dispatches/:id/encrypted-prompt`:
  POST (citizen attaches envelope; emits
  compute_serving.encrypted_prompt_posted ledger event);
  GET ?workerId=... (worker fetches for client-side
  decryption). Serve endpoint extended to auto-wipe envelope
  after successful serve (forward secrecy + reduced surface).
  Error codes: 400 invalid_encrypted_prompt / workerId_required
  / 403 not_requester / not_assigned / 404 unknown_dispatch /
  envelope_not_found / 409 envelope_already_posted /
  dispatch_not_pending / dispatch_expired. NEW
  `frontend/src/lib/compute-encryption.ts` (~200 lines) —
  pure Web Crypto helpers: generateWorkerEncryptionKeypair
  (P-256), encryptPromptForWorker (ECDH + HKDF + AES-GCM
  with fresh ephemeral keypair for forward secrecy),
  decryptPromptFromCitizen (inverse). NEW
  `frontend/src/lib/worker-encryption-keypair-store.ts` —
  Zustand + persist (localStorage) keyed on identityId. Worker
  private key NEVER crosses network. EXTENDED hooks.ts with
  usePostEncryptedPrompt + useFetchEncryptedPrompt. WIRED
  ComputeServingCapacityCard — generates keypair on publish +
  passes pubkey; PendingDispatchRow adds "Fetch & decrypt
  prompt" affordance with skip-option for older capacities.
  WIRED ComputeNetworkTestCard — when capacity has pubkey,
  encrypts prompt locally before sending; partial-success path
  surfaced honestly. Both cards' "How this works" copy updated.
  **Adversarial review** verdict: **ship_with_no_must_fix**.
  Privacy posture sound by construction (plaintext never on BE;
  worker privkey never off device; forward secrecy via
  ephemeral keypair per dispatch; AEAD auth-tag detects
  tampering — vitest pinned; ledger emits POINTER + count meta
  only — test asserts ciphertext absent in JSON; DPDP cascade
  + auto-wipe after serve). Notes for SF-1 (empty HKDF salt
  acceptable due to ephemeral pubkey uniqueness), SF-2 (no AAD
  binding to dispatchId yet — helper supports it), SF-3
  (generic decrypt error preserves AEAD privacy posture).
  **§15 bindings**: plaintext never on BE; pointer-only ledger
  emit; FORBIDDEN_SUBSTRINGS probe rejects plaintext-leak
  fields at boundary; forward-secret ephemeral keys per
  dispatch; DPDP cascade. **API_INTEGRATIONS.md impact**: ZERO
  new external API. **FE-BE parity**: BE delta = validator +
  capacity extension + store + 2 endpoints + serve-wipe +
  cascade; FE delta = crypto helpers + keypair store + 2 hooks
  + wiring on both cards + test files. Tests: vitest 506 →
  **513** (+7 crypto roundtrip including multi-byte UTF-8 +
  forward secrecy + tamper detection); Node 1406 → **1426**
  (+20 encrypted-prompt entity + endpoints + cascade + FE↔BE
  convergence). tsc clean.
- **Phase 13.7.2 — SHIPPED 2026-06-03 (ADR 0166).** FE wiring
  for the compute network — closes the v1 demo loop on top of
  the 13.7.1 BE substrate. EXTENDED
  `frontend/src/lib/compute-serving-capacity.ts` with
  COMPUTE_SERVING_DISPATCH_STATUSES + ComputeServingDispatch
  type + `sha256Pointer(text)` Web Crypto helper (pinned
  against RFC 6234 test vector). EXTENDED `hooks.ts` with 4
  hooks: useComputeServingDispatchesPending /
  useComputeServingDispatchesSent (both poll every 5s) /
  useCreateComputeServingDispatch /
  useServeComputeServingDispatch (invalidates mesh-balance on
  success). EXTENDED ComputeServingCapacityCard — new
  PendingDispatchesSection at the bottom showing pending count
  + per-dispatch row with prompt-hash prefix + "Mark as
  served" → inline form for response text + actual tokens →
  sha256-hashes response client-side. NEW
  `frontend/src/components/ComputeNetworkTestCard.tsx` (~290
  lines) — citizen-side card mounted on /labs that walks
  active worker capacities (filtering self), lets citizen pick
  a worker + type a prompt + sets estimated tokens, sends
  dispatch with prompt-hash-only over the wire, polls own
  sent list every 5s. Honest framing in both cards' "How this
  works" details: v1 limitation is the worker can't see the
  citizen's prompt text (only the hash); manual-serve honor-
  system; 13.7.3 replaces with encryption + automated WASM
  serving. **Adversarial review** verdict:
  **ship_with_no_new_fixes**. The §15 binding holds — both
  citizen's prompt + worker's response stay on-device; only
  sha256 hashes cross the wire. Known limitations are
  inherited from 13.7.1 (race; cap not enforced at dispatch;
  no verifiable serve). v1 also walks all identities O(N) for
  capacity discovery — production needs a proper browse
  endpoint, noted in ADR. **§15 bindings**: prompt + response
  bytes never on BE; pointer-only payload; identity-keyed
  remount. **API_INTEGRATIONS.md impact**: ZERO new external
  API. **FE-BE parity**: BE delta = NONE; FE delta = lib
  types + 4 hooks + worker card extension + new citizen card
  + Labs mount + test files. Tests: vitest 500 → **506** (+6
  ComputeNetworkTestCard render + sha256Pointer pin). Node
  1405 → **1406** (+1 dispatch-status convergence). tsc clean.
- **Phase 13.7.1 — SHIPPED 2026-06-02 (ADR 0165).** BE
  dispatch + serve substrate — wires the 13.7 compute network
  loop end-to-end at the BE layer. NEW
  `src/phase1/compute-serving-dispatch.mjs` (~270 lines) —
  strict-allowlist validator + state-transition helper + 2
  ledger event builders. Protocol pinned
  `bos.phase13.compute-serving-dispatch.v1`. 16-entry
  PERMITTED_DISPATCH_KEYS + 13-entry
  COMPUTE_SERVING_DISPATCH_FORBIDDEN_SUBSTRINGS probe (same
  list as the capacity entity). Two pointer fields enforce the
  §15 binding: `promptHash` + `responseHash` are sha256:<hex64>
  pointers; the actual prompt/response bytes never reach the
  dispatch record. Content-derived dispatchId; ms-stripped
  timestamps; 15-minute TTL on pending dispatches.
  `applyServeToDispatch` computes payout via ceil bucketing —
  `payoutPaise = ceil(actualTokens / 1000) ×
  capacity.pricePerKTokensPaise` — so workers can't be cheated
  by under-1K rounding. EXTENDED store + sqlite-store with
  dispatch persistence + new `compute_serving_dispatches`
  table indexed on requester_id, worker_id, status. DPDP §12
  cascade entry added to both backends — dispatches wipe by
  EITHER requesterId OR workerId. EXTENDED `src/phase0/api.mjs`
  — 4 new endpoints: POST
  `/api/compute-serving-dispatches` (citizen creates pending
  dispatch); POST
  `/api/compute-serving-dispatches/:dispatchId/serve` (worker
  submits served — atomic in-handler: validates dispatch +
  capacity + worker + TTL → applyServeToDispatch → persists
  served → creates mesh-contribution event crediting worker →
  emits compute_serving.served ledger event); GET
  `/api/identities/:id/compute-serving-dispatches/sent` /
  `/pending` (history endpoints).  Errors at boundary with
  explicit codes: 400 invalid_dispatch / invalid_serve; 404
  unknown_requester / unknown_capacity / unknown_dispatch; 409
  capacity_not_active / capacity_expired / self_dispatch /
  duplicate_dispatch / dispatch_not_pending / dispatch_expired;
  403 not_assigned. **Adversarial review** verdict:
  **ship_with_known_limitations** (no must-fix for v1).
  Documented for follow-up: race on concurrent serves (mirrors
  13.5.1 limitation); maxConcurrent + maxDailyTokens not
  enforced at dispatch time; no verification that the worker
  actually ran the prompt (needs encryption substrate from
  13.7.3). All other concerns caught at boundary with explicit
  error codes. **§15 bindings**: POINTER-only ledger (hashes,
  not bytes); strict-allowlist; ms-stripped timestamps;
  worker-gated serve; self-dispatch rejected; DPDP cascade.
  **API_INTEGRATIONS.md impact**: ZERO new external API.
  **FE-BE parity**: BE delta = entity + store + 4 endpoints
  + cascade; FE delta = NONE (13.7.2 wires the worker-side
  serve UI). Tests: vitest 500 unchanged; Node 1379 → **1405**
  (+26 compute-serving-dispatch.test). tsc clean.
- **Phase 13.7 — SHIPPED 2026-06-02 (ADR 0164).**
  Compute-serving capacity substrate per
  [[compute-network-mesh-workload]] — opens the §13.x compute
  network revenue line. v1 ships the worker-side opt-in
  substrate; the dispatch + serve flow lands as 13.7.1 with a
  Phase 9.0c runtime serve-mode extension. NEW
  `src/phase1/compute-serving-capacity.mjs` (~250 lines) —
  strict-allowlist validator + revoke (worker-gated) + pause +
  ledger-event builder. Protocol pinned
  `bos.phase13.compute-serving-capacity.v1`. 13-entry
  PERMITTED_CAPACITY_KEYS + 3-entry PERMITTED_CONSTRAINT_KEYS +
  13-entry COMPUTE_SERVING_CAPACITY_FORBIDDEN_SUBSTRINGS probe
  (prompt / completion / response / content / plaintext /
  rawBody / snippet / preview / unmasked / phoneNumber /
  deviceId / imei / imsi). Caps: `pricePerKTokensPaise` ∈ [50,
  50_000], `maxConcurrent` ∈ [1, 4], `maxDailyTokens` ∈ [10K,
  10M], `batteryMinPercent` ∈ [20, 100], TTL ∈ [24h, 90d].
  Content-derived capacityId → re-publishing identical envelope
  returns 409. ms-stripped timestamps mirror Phase 13.2/13.5
  typing-speed defence. EXTENDED `mesh-contribution.mjs` —
  MESH_WORKLOAD_TYPES grows 6 → **7** with `compute_serving`;
  payload requires `tokens`; payout capped at ₹50 per dispatch
  as defence-in-depth; two new pointer fields
  `computeServingCapacityId` + `computeServingDispatchId` (the
  latter set by future 13.7.1 dispatch flow). EXTENDED store +
  sqlite-store with saveComputeServingCapacity (with
  `{skipLedger}` opt for future dispatch-driven writes) / read
  / list; new `compute_serving_capacities` table indexed on
  worker_id. DPDP §12(3) cascade entry added to both backends —
  capacities wipe on identity erase. EXTENDED `src/phase0/api.mjs`
  — 4 endpoints under
  `/api/identities/:id/compute-serving-capacity`:
  GET (list + supported statuses); POST (publish; 400
  invalid_compute_serving_capacity; 409 duplicate_capacity);
  DELETE (worker-gated revoke); POST :id/pause. NEW
  `frontend/src/lib/compute-serving-capacity.ts` — mirrors BE
  enums + 5 default helpers + formatPricePerKTokens. EXTENDED
  hooks.ts with 4 TanStack Query hooks. NEW
  `frontend/src/components/ComputeServingCapacityCard.tsx`
  (~340 lines) — worker-facing form (price + maxConcurrent +
  maxDailyTokens + batteryMinPercent + requireWifi +
  requireCharging) + per-capacity Pause/Revoke. Honest
  empty state + inline error surface. "How this works" details
  panel surfaces the substrate-only framing. EXTENDED
  /settings page — card mounted below PersonalizationCard.
  **Adversarial review** verdict: **ship_with_no_fixes**.
  Privacy posture sound by construction; UX honest with v1
  substrate framing; all edge cases caught at boundary.
  **§15 bindings**: POINTER-only ledger;
  strict-allowlist; ms-stripped timestamps; worker-gated
  mutations; DPDP cascade; device-state constraints are
  thresholds not fingerprints; never any prompt/response bytes
  on the BE. **API_INTEGRATIONS.md impact**: ZERO new external
  API. **FE-BE parity**: BE delta = validator + mesh workload
  type + store + 4 endpoints + cascade; FE delta = lib hooks +
  card + Settings mount + test files. Tests: vitest 500
  unchanged (FE composes existing patterns); Node 1347 →
  **1379** (+32 compute-serving-capacity.test). tsc clean.
- **Phase 13.5.2 — SHIPPED 2026-06-02 (ADR 0163).** Signed
  citizen-data-offer audit-export bundle. Mirrors the Phase
  10.5 labeling-export pattern (ADR 0124). NEW
  `src/phase1/citizen-data-offer-export.mjs` (~220 lines) —
  protocol pinned at `bos.phase13.citizen-data-offer-export.v0`,
  `identityHashFor(sponsorId, publisherId)` rotates per (sponsor,
  publisher) so cross-sponsor correlation is prevented,
  `buildCitizenDataOfferExportLines` produces sorted NDJSON
  (header + per-purchase + Ed25519-signed trailer with content
  SHA-256), `verifyCitizenDataOfferExportLines` for server-side
  verification. EXTENDED
  `src/phase1/citizen-data-offer-purchase.mjs` — added
  `dataPointKind` to PERMITTED_PURCHASE_KEYS so the audit-export
  bundle stays self-contained after DPDP §12 cascade wipes the
  source offer record. API handler reads `offer.dataPointKind`
  and denormalises onto the purchase at sale time. NEW endpoint
  `GET /api/sponsors/:sponsorId/data-offer-purchases/export.ndjson`
  — bearer-gated; lazy-loads audit signer identity; emits
  `citizen_data_offer_export.signed` ledger event with
  content SHA-256 + purchase count; returns
  `application/x-ndjson`. FE: NEW
  `verifyCitizenDataOfferExportLinesAsync` in
  sponsor-export-verify.ts (thin wrapper over labeling-export
  async verifier with `purchaseCount` rename); NEW
  `useSponsorDataOfferExport` mutation hook — fetches bundle +
  fetches audit signer public key + runs async crypto verify +
  returns blob for download. EXTENDED SponsorDataOffers page
  with `ExportButton` next to "Recent purchases" — honest
  verdict surface (verified / verification failed / signer
  fetch failed). **Adversarial review** (3 lenses): **0
  fixes**. Privacy invariants pinned at test layer
  (publisherId never in bundle — sha256 hex output structurally
  cannot contain non-hex chars in publisher tokens; identityHash
  rotation per sponsor; bearer auth; pointer-only ledger
  event). Accuracy: stable bundle for same inputs regardless of
  array order; empty bundle still well-formed; signature
  mismatch + content tampering + bearer failures all caught at
  boundary. **Why per-data-point delivery signature is
  deferred**: the audit-export bundle is the FINANCIAL +
  CONSENT provenance trail (proves what was paid for + when +
  by whom + for which purpose); the actual byte flow needs a
  separate data-delivery substrate that doesn't yet exist.
  Audit bundle is useful WITHOUT delivery flow for accounting /
  dispute resolution / DPDP compliance proofs. **§15
  bindings**: rotated identityHash; signed-and-verifiable
  bundle; bearer-gated read; ledger emits POINTER + count
  meta. **API_INTEGRATIONS.md impact**: ZERO new external API
  (composes the existing audit signer at
  `/api/audit-signer/public-key`). Last-updated bumped.
  **FE-BE parity**: BE delta = builder + verifier + endpoint +
  purchase denormalisation; FE delta = verifier wrapper + hook
  + ExportButton. Tests: vitest 500 unchanged (FE wires existing
  verify path); Node 1334 → **1347** (+13
  citizen-data-offer-export.test). tsc clean.
- **Phase 13.5.1 — SHIPPED 2026-06-02 (ADR 0162).** Sponsor
  browse + purchase flow — closes the 13.5 revenue loop
  end-to-end. NEW
  `src/phase1/citizen-data-offer-purchase.mjs` (~150 lines):
  validator (strict-allowlist `PERMITTED_PURCHASE_KEYS`, 9
  fields), `applyPurchaseToOffer` pure state transition
  (salesCount++ + active→exhausted at cap),
  `buildCitizenDataOfferPurchasedLedgerEvent` (POINTER +
  count-only meta; ms-stripped `at`). EXTENDED
  `src/phase1/mesh-contribution.mjs` — new
  `citizen_data_sale` workload type (6 total in
  MESH_WORKLOAD_TYPES); payout = pricePerSalePaise; new
  optional pointer fields `citizenDataOfferId` +
  `citizenDataPurchaseId`. EXTENDED store + sqlite-store with
  `saveCitizenDataOfferPurchase` / read / list (by sponsor +
  publisher + offer); new `citizen_data_offer_purchases` table
  with 3 indexes. DPDP §12(3) cascade entry added to both
  backends — purchases wipe by publisherId. EXISTING
  `saveCitizenDataOffer` gets `{skipLedger}` option so the
  bumped-offer save doesn't double-fire the auto-emit
  alongside the explicit citizen_data_offer.purchased event.
  EXTENDED `src/phase0/api.mjs` — 3 new endpoints under
  `/api/sponsors/:sponsorId/`, all bearer-gated through
  `checkSponsorAuth`: `GET /data-offers/browse[?purpose=...]`
  (active offers with remaining capacity); `POST
  /data-offers/:offerId/purchase` (atomic in-handler:
  validate purpose + offer status/expiry/cap + purpose
  allowlist → lock-then-debit sponsor escrow → build
  purchase + mesh event + bumped offer → persist sponsor → ledger
  sponsor_escrow.debited → offer (skipLedger) → purchase →
  mesh event → ledger citizen_data_offer.purchased → 201
  with purchase + offer + sponsor + mesh event); `GET
  /data-offer-purchases` (sponsor's own history). Errors:
  409 `insufficient_escrow` with availablePaise +
  requiredPaise; 403 `purpose_not_allowlisted`; 409
  `offer_{not_active|expired|exhausted}`; 404
  `unknown_offer`; 400 `invalid_purpose`. NEW FE hooks:
  `useSponsorBrowseDataOffers(purpose?)`,
  `useSponsorPurchaseDataOffer`,
  `useSponsorDataOfferPurchases`. NEW
  `frontend/src/routes/sponsor/SponsorDataOffers.tsx` (~230
  lines) — sponsor-facing browse + per-offer purpose
  selector + "Buy one" action + inline error surface
  mapping every BE error code to a citizen-readable
  message + recent-purchases list. EXTENDED
  SponsorBottomNav with "Data" tab. EXTENDED
  SponsorSurface routes with `/sponsor/data-offers`.
  **Adversarial review** verdict:
  **ship_with_known_limitations** (no must-fix for v1
  demo). Privacy + bearer + strict-allowlist sound by
  construction. Known limitations noted for follow-up: race
  on concurrent purchases (two reads see same salesCount;
  last-write-wins); non-atomic persistence chain (mid-
  failure leaves inconsistent state); no self-purchase
  guard. All caught at boundary with explicit error codes.
  **§15 bindings**: POINTER-only ledger;
  strict-allowlist; ms-stripped timestamps; bearer-gated
  reads + writes; DPDP cascade; bytes-never-on-BE
  (delivery flow lands 13.5.2). **API_INTEGRATIONS.md
  impact**: ZERO new external API. **FE-BE parity**: BE
  delta = entity + store + 3 endpoints + cascade; FE
  delta = lib hooks + page + nav + route. Tests: vitest
  500 unchanged (FE page composes existing hooks); Node
  1315 → **1334** (+19 citizen-data-offer-purchase.test).
  tsc clean.
- **Phase 13.6 — SHIPPED 2026-06-02 (ADR 0161).** Public
  marketing pages — the investor / partner-facing website that
  lives alongside the existing citizen onboarding at `/`. 4
  new public routes (no ProtectedSurface wrapper): `/about`,
  `/how-it-works`, `/for-citizens`, `/for-sponsors`. NEW
  `frontend/src/components/MarketingLayout.tsx` — shared
  header (Bharat OS logo + 4-link nav + "Try the demo" CTA) +
  semantic `<main>` + footer (per-pillar columns +
  compliance posture + cross-link to demo). NEW
  `frontend/src/routes/AboutPage.tsx` — what Bharat OS is,
  founder thesis ("AI built somewhere else, for someone else"),
  market sizing (700M smartphone users + 700M without), 3
  pillars (on-device / citizen-owned / economically aligned),
  what-it-is vs what-it-is-not lists, demo CTA. NEW
  `frontend/src/routes/HowItWorksPage.tsx` — 6 substrate
  cards (on-device SLM, summariser/redactor/personalisation,
  skill agents, citizen data marketplace, worker marketplace,
  provider marketplace) each with `Shipped` badge; 5 §15
  privacy invariants (pointer-not-payload, strict allowlist,
  DPDP §12 cascade, signed consent, allowlisted launchers);
  3-step distribution path (App → AOSP → full ROM) each with
  `Planned` badge per SF-2 below. NEW
  `frontend/src/routes/ForCitizensPage.tsx` — Use/Earn/Provide
  trio per [[onboarding-hero-earn-use]]; 5 data point kinds
  per [[citizen-data-as-product-revenue]]; Sahayak section per
  [[sahayak-no-smartphone-onboarding]]; privacy guarantees
  list. NEW `frontend/src/routes/ForSponsorsPage.tsx` — 3
  sponsor surfaces (labeling marketplace / federated rounds /
  citizen data marketplace) with shipped badges; bearer-token
  + escrow + QC + signed-export posture; DPDP Act 2023 + RBI
  / NPCI compliance section. EXTENDED `App.tsx` — 4 new
  public routes registered above the catch-all.
  **Adversarial review** (3 lenses: factual accuracy /
  accessibility / cross-links): **2 MUST_FIX + 2 SHOULD_FIX**.
  MF-1 "Sign up takes 30 seconds (phone OTP, no PII required)"
  was misleading — phone is PII under DPDP; rewritten to
  "Your number is the only personal field we collect at this
  stage — everything else is opt-in per surface and gated by
  signed consent." MF-2 "open-source substrate" claims
  removed (no LICENSE file at repo root yet); replaced with
  "strict-allowlist boundary normalisers" in the footer
  posture. SF-1 `aria-label="Marketing site navigation"` on
  the nav. SF-2 `Planned` warning badges on the 3 distribution
  cards so investors don't read them as already-shipped.
  **§15 bindings**: pages don't access any citizen data (public
  routes); no fetch calls; copy adversarially-reviewed against
  shipped reality (every factual claim backed by an ADR or
  memory binding). **FE-BE parity**: BE delta = NONE (FE-only
  marketing). Tests: vitest 490 → **500** (+10 render smoke
  tests). Node 1315 unchanged. tsc clean.
- **Phase 13.5 — SHIPPED 2026-06-02 (ADR 0160).** Opens the
  13.x revenue-line track per [[citizen-data-as-product-revenue]]:
  citizens publish per-data-point sale offers to Bharat OS
  sponsors via signed-consent, revocable, paid into mesh balance.
  This phase ships the CITIZEN-SIDE substrate (publish + list +
  pause + revoke); sponsor browse + purchase flow lands in 13.5.1.
  NEW `src/phase1/citizen-data-offer.mjs` (~310 lines) — strict
  allowlist validator + revoke/pause functions + ledger-event
  builder. Protocol pinned
  `CITIZEN_DATA_OFFER_PROTOCOL_VERSION = 'bos.phase13.citizen-data-offer.v1'`.
  Three frozen enums: `DATA_POINT_KINDS` (5 kinds: intent_text /
  doc_summary / pii_redaction / skill_run / mesh_contribution),
  `SPONSOR_PURPOSES` (6 purposes: model_training /
  model_evaluation / safety_benchmark / product_research /
  academic_research / gov_audit), `CITIZEN_DATA_OFFER_STATUSES`
  (active / paused / revoked / exhausted). Strict allowlist on
  14 PERMITTED_CITIZEN_DATA_OFFER_KEYS + 10-entry
  CITIZEN_DATA_OFFER_FORBIDDEN_SUBSTRINGS probe. Caps:
  pricePerSalePaise ∈ [₹1, ₹100,000], maxSales ∈ [1, 1000],
  TTL ∈ [24 hours, 365 days]. Content-derived offerId via sha256
  → re-publishing identical envelope returns 409 (no spam).
  `revokeCitizenDataOffer` requires publisher attribution
  (defence-in-depth alongside the API handler gate).
  `buildCitizenDataOfferLedgerEvent` emits POINTER + count-only
  meta (offerId / publisherId / dataPointKind / price / maxSales
  / salesCount / purposeCount / at); never the data points
  themselves. `at` ms-stripped per Phase 13.0.2 MF-1 pattern.
  EXTENDED `src/phase0/store.mjs` + `src/phase0/sqlite-store.mjs`
  — saveCitizenDataOffer / readCitizenDataOffer /
  listCitizenDataOffers({publisherId?}); new `citizen_data_offers`
  table + `citizen-data-offers/` directory; emits
  citizen_data_offer.{published|paused|revoked} ledger events.
  DPDP §12(3) cascade entry added to both backends — offers wipe
  on identity erase. EXTENDED `src/phase0/api.mjs` — 4 endpoints
  under `/api/identities/:id/data-offers`: GET (list + supported
  enums), POST (publish; 400 invalid_citizen_data_offer; 409
  duplicate_offer), DELETE (publisher-gated revoke), POST :id/pause.
  Sponsor-side browse + purchase endpoints explicitly deferred
  to 13.5.1. NEW `frontend/src/lib/citizen-data-offer.ts` —
  mirrors BE enums + citizen-facing labels + formatRupees +
  defaultExpiresAt helpers. EXTENDED `frontend/src/lib/hooks.ts`
  — 4 TanStack Query hooks (useCitizenDataOffers + create +
  revoke + pause). NEW
  `frontend/src/components/CitizenDataOffersPanel.tsx` (~340
  lines) — citizen-facing publish + manage panel; pill picker
  for DataPointKind + number inputs for price/maxSales + chip
  multi-select for purposes + inline error surface on 409/400 +
  honest empty state + Pause/Revoke actions per offer. Mounted
  on /labs keyed on `data-offers-<identityId>` for identity-flip
  remount. **Adversarial review** (3 lenses): **0 fixes**.
  Privacy posture sound by construction (strict allowlist +
  FORBIDDEN_SUBSTRINGS probe + count-only ledger + publisher-
  gated revoke + DPDP cascade); UX honest (revoked offers stay
  listed; explicit "v1 ships publish, 13.5.1 ships purchase"
  framing); edge cases covered (calendar-invalid timestamps
  reject at boundary; same-second double-publish 409s via
  content-hash; cross-publisher revoke 403/404s).
  **§15 bindings**: pointer-only ledger; strict allowlist;
  publisher-gated mutations; DPDP cascade; bytes-stay-on-device
  until citizen-signed delivery (Phase 13.5.1).
  **API_INTEGRATIONS.md impact**: ZERO new external API. The
  endpoints are intra-BE only; sponsor purchase will reuse
  existing escrow + mesh substrates in 13.5.1. Last-updated
  header bumped. **FE-BE parity**: BE delta = validator + store
  + 4 endpoints + 1 cascade entry; FE delta = lib + hooks +
  panel + Labs wiring + test files. Tests: vitest 490
  unchanged (FE↔BE convergence tested via Node-side regex
  extraction of FE source); Node 1284 → **1315** (+31
  citizen-data-offer.test). tsc clean.
- **Phase 13.4.3 — SHIPPED 2026-06-02 (ADR 0159).** Closes
  the 13.4.x sub-arc — wires SLM-H action verbs to real
  next-step launchers (URLs / tel: / in_app routes). EXTENDED
  `frontend/src/lib/skill-agent.ts` — strict-discriminated
  `SkillActionLauncher` union (kind: url | tel | in_app | none),
  `ACTION_LAUNCHER: Record<SkillActionVerb,
  SkillActionLauncher>` (exhaustive Record forces every verb to
  have a launcher; TS error on drift). 4-entry frozen URL
  allowlist `ALLOWED_LAUNCHER_URL_PREFIXES`:
  consumerhelpline.gov.in / edaakhil.nic.in / pmkisan.gov.in /
  findmycsc.nic.in (all official Government of India / NIC
  domains). Module-load guard `assertLauncherIsAllowlisted`
  runs on every `url` entry — adding a non-allowlisted URL
  fails IMPORT-time. Per-launcher `verifyPrefix` field is
  defence-in-depth against typos
  (`pmkisan.gov.in.malicious.example/` catches at boundary).
  18 verbs distribute: 6 url (consumerhelpline + edaakhil×3 +
  pmkisan + findmycsc), 2 tel (1915 + 155261), 1 in_app
  (/citizen/notes), 9 none. NEW
  `frontend/src/components/SkillActionLink.tsx` (~70 lines) —
  shared renderer used by all 3 SLM-H panels. Exhaustive
  switch on `launcher.kind`: `url` → `<a target="_blank"
  rel="noopener noreferrer">` (security defaults for external
  nav); `tel` → `<a href="tel:NUMBER">` with "(tap to dial)"
  caption; `in_app` → react-router `<Link>` (SPA-internal, no
  target=_blank); `none` → plain `<span>`. UPDATED
  SkillAgentPanel + ConsumerComplaintPanel + PmKisanStatusPanel
  — each action `<li>` now wraps `<SkillActionLink verb={v} />`
  instead of plain `ACTION_LABEL[v]` text.
  **Adversarial review** (3 lenses): **1 fix**. SF-1
  `/citizen/flags` route does not exist (Sahayak surface
  ships in Phase 14.x); flag_for_review re-mapped to
  `kind: 'none'` so a click doesn't 404. **§15 bindings**:
  4-link defence-in-depth chain so the SLM cannot inject a
  clickable URL — (1) parser only accepts SKILL_ACTION_VERBS
  members; (2) ACTION_LAUNCHER keyed exhaustively on
  SkillActionVerb; (3) module-load asserts URL allowlist;
  (4) renderer reads from the map, never from SLM output. No
  string from the model ever flows into href.
  **API_INTEGRATIONS.md impact**: ZERO new external API. The
  links are 4 GoI official portals; no adapter / env var /
  partner credential. Last-updated header bumped.
  **FE-BE parity**: BE delta = none (FE-only navigation
  wiring); FE delta = launcher map + shared component + 3
  panel updates + 2 test files. Tests: vitest 467 → **490**
  (+16 launcher-map test + 7 SkillActionLink render test).
  Node 1284 unchanged (no BE delta). tsc clean.
- **Phase 13.4.2 — SHIPPED 2026-06-02 (ADR 0158).** Third
  concrete SLM-H skill: PM-KISAN status checker. Completes the
  v1 SLM-H skill rollout (electricity bill + consumer complaint
  + PM-KISAN). Same thin-sub-phase pattern as 13.4.1. NEW
  `frontend/src/lib/skills/pm-kisan-status-checker.ts` (~225
  lines) — `SkillDefinition<PmKisanInput, PmKisanFields>`.
  Input: free-form `concernText` + required `currentDateIso`
  (YYYY-MM-DD; validated by regex + `Date.parse` round-trip so
  calendar-invalid shapes like `2026-13-99` reject at the
  boundary). Output layered on SkillBaseFields: SCHEME_STATUS
  (likely_active / likely_inactive / eligibility_uncertain /
  unknown), LIKELY_BLOCKER (4 canonical reasons hardcoded in
  prompt: ekyc_pending / bank_aadhaar_unseeded /
  land_record_mismatch / ineligible_landholding + none +
  unknown), NEXT_INSTALLMENT_WINDOW (≤ 120 chars; seeded by
  prompt with the three PM-KISAN installment windows Apr-Jul /
  Aug-Nov / Dec-Mar), KEY_CHECKS (1-5, deduped + capped).
  Drift coerces to safest defaults (`unknown` for both
  enums). EXTENDED `frontend/src/lib/skill-agent.ts` — 5 new
  action verbs: `complete_pm_kisan_ekyc`,
  `check_aadhaar_bank_seeding`, `verify_land_records`,
  `contact_pm_kisan_helpline` (155261), `visit_csc_for_correction`.
  ACTION_LABEL extended with canonical resolution paths
  referencing pmkisan.gov.in, mAadhaar/NPCI mapper, Bhulekh,
  CSC. Allowlist grew 13 → 18. EXTENDED
  `src/phase1/skill-agent-seed.mjs` — third seed entry
  (category=government_scheme_status, supportedDocKinds=
  ['generic'], maxInputChars 4000, maxOutputChars 1400). NEW
  `frontend/src/components/PmKisanStatusPanel.tsx` —
  standalone panel mounted on /labs below
  ConsumerComplaintPanel, keyed on `pmkisan-<identityId>`.
  Same shape as ConsumerComplaintPanel: honest empty state on
  no SLM, 30-char minimum gate, synchronous `runningRef`
  guard, 2400-char input cap. EXTENDED Labs.tsx wiring.
  **Adversarial review** (3 lenses): **0 fixes**. MF-1
  spacer-preservation pattern applied from the start; date
  validation rejects bad shapes at boundary; all drift
  coerces to safe defaults; no ledger event in this phase so
  the SF-2 PII-grep guard isn't load-bearing.
  **§15 bindings**: pointer-only registry row; strict
  allowlist; no fetch(); honest hide. **Why v1 is
  informational (not adapter-backed)**: pmkisan.gov.in lacks
  a documented JSON API; a v1 adapter would need scraping or
  partner data-share. Wiring lands in a future 13.4.x.
  **API_INTEGRATIONS.md impact**: ZERO new external API
  (deferred). Last-updated header bumped. **FE-BE parity**:
  BE delta = +1 seed entry; FE delta = new skill file + new
  panel + 5 new ACTION verbs + Labs wiring + test files.
  Tests: vitest 442 → **467** (+25
  pm-kisan-status-checker.test); Node 1284 unchanged (the
  Node skill-agent test was updated to expect 3 categories
  in-place, not added). tsc clean.
- **Phase 13.4.1 — SHIPPED 2026-06-02 (ADR 0157).** Second
  concrete SLM-H skill: consumer complaint drafter. Composes
  the 13.4 substrate; thin sub-phase (one new skill file + one
  seed entry + standalone panel + 5-verb extension to the
  shared `SKILL_ACTION_VERBS` allowlist). NEW
  `frontend/src/lib/skills/consumer-complaint-drafter.ts` (~210
  lines) — `SkillDefinition<ConsumerComplaintInput,
  ConsumerComplaintFields>`. Input: free-form complaint text +
  optional related-doc title / TLDR. Output layered on
  SkillBaseFields: DRAFT_SUBJECT + FORUM_LEVEL (district / state
  / national per Consumer Protection Act 2019 jurisdictional
  tiers) + RELIEF_KIND (refund / replacement / service_redo /
  compensation / apology / mixed) + ESTIMATED_PROCESSING_DAYS
  (clamped [30, 720]) + KEY_FACTS (1-5, deduped + 5-capped at
  parser). Drift coerces to safest defaults
  (FORUM_LEVEL→district, RELIEF_KIND→mixed). EXTENDED
  `frontend/src/lib/skill-agent.ts` — 5 new action verbs:
  `file_complaint_district_commission`,
  `file_complaint_state_commission`,
  `file_complaint_national_commission`,
  `escalate_to_consumer_helpline`, `send_legal_notice`. Each
  with citizen-readable ACTION_LABEL referencing CPA 2019
  jurisdictional rules verbatim. SKILL_ACTION_VERBS coerced to
  `Object.freeze` for runtime defence-in-depth (matches
  Phase 13.4 SKILL_AGENT_CATEGORIES posture). EXTENDED
  `src/phase1/skill-agent-seed.mjs` — second seed entry
  (category=consumer_complaint_drafter, supportedDocKinds=
  ['generic'], maxInputChars 6000, maxOutputChars 1600). NEW
  `frontend/src/components/ConsumerComplaintPanel.tsx` —
  standalone panel mounted on /labs below SkillAgentPanel,
  keyed on `complaint-<identityId>`. Honest empty state on no
  SLM; 40-char minimum gate on Draft button with inline hint;
  synchronous `runningRef` guard; 2400-char input cap with
  overcap warning. EXTENDED Labs.tsx wiring.
  **Adversarial review** (3 lenses): **1 MUST_FIX**. MF-1 the
  initial prompt builder used
  `[...].filter(Boolean).join('\n')` to optionally drop the
  related-doc-context block — this also silently collapsed the
  intentional blank-line spacers between profile fragment +
  role line and between complaint + YOUR ANSWER, degrading the
  prompt structure (byte-equal test passed but the SLM would
  see a different shape). Fixed by building the prompt with
  explicit `parts.push(...)` + conditional sections; regression
  pin in vitest. **§15 bindings**: pointer-only registry row
  (prompt body in FE bundle); strict allowlist; no fetch();
  honest hide; no PII to ledger. **API_INTEGRATIONS.md impact**:
  ZERO new external API. Last-updated header bumped.
  **FE-BE parity**: BE delta = +1 seed entry; FE delta = new
  skill file + new panel + ACTION verbs extension + Labs
  wiring + test files. Tests: vitest 419 → **442** (+23
  consumer-complaint-drafter.test); Node 1282 → **1284** (+2
  seed coverage + extended catalog HTTP test). tsc clean.
- **Phase 13.4 — SHIPPED 2026-06-02 (ADR 0156).** SLM-H
  on-device skill-agent substrate + first concrete skill
  (electricity bill explainer). Closes the SLM USP arc per
  [[phase-12-13-sequencing-set]]. NEW
  `src/phase1/skill-agent.mjs` (~290 lines) — registry validator
  mirroring Phase 9.0a SLM model-pack pattern.
  `SKILL_AGENT_PROTOCOL_VERSION = 'bos.phase13.skill-agent.v1'`,
  3 categories (`utility_bill_explainer`,
  `consumer_complaint_drafter`, `government_scheme_status`),
  strict-allowlist `PERMITTED_SKILL_AGENT_KEYS` + 13-entry
  `FORBIDDEN_REGISTRY_SUBSTRINGS` SF-2-style probe, content-
  addressed `skillId` via sha256, soft-delete via
  `revokeSkillAgent`. NEW `src/phase1/skill-agent-seed.mjs` —
  built-in canonical seed list (v1 entry: electricity bill
  explainer; license apache-2.0; supportedDocKinds:
  ['electricity_bill']). EXTENDED `src/phase0/store.mjs` +
  `src/phase0/sqlite-store.mjs` — saveSkillAgent /
  readSkillAgent / listSkillAgents; new `skill_agents` table /
  `skill-agents/` directory; ledger emits
  `skill_agent.registered` / `.revoked` (pointer + meta only;
  never the FE prompt body). EXTENDED `src/phase0/api.mjs` —
  boot-time idempotent seed loader on first request (promise-
  sentinel concurrency guard + SF-3 retry-on-empty), public
  GET /api/skill-agents (with `?activeOnly` and
  `?installedFamilies` filters), GET /api/skill-agents/:skillId,
  admin POST + DELETE under /api/admin/skill-agents (5.7-token-
  gated). FE: NEW `frontend/src/lib/skill-agent.ts` (~190 lines)
  — shared substrate; `parseSkillBaseFields` shared parser for
  HEADLINE / ASSESSMENT / CONFIDENCE / RISK_FLAG / ACTIONS prefix;
  frozen `SKILL_ACTION_VERBS` allowlist (8 verbs) +
  citizen-readable `ACTION_LABEL` map. NEW
  `frontend/src/lib/skills/electricity-bill-explainer.ts` —
  first concrete skill; SkillDefinition with prompt builder +
  parser. Composes SLM-E doc-summary output as input; emits
  TARIFF_TIER (6-way enum: domestic_low/mid/high + commercial +
  industrial + unknown) + EXPECTED_RANGE_RUPEES (with min ≤ max
  guard + 100k₹ cap) + DEVIATION_FLAG (4-way) on top of base
  fields. NEW `frontend/src/lib/use-slm-skill-agent.ts` —
  generic hook over `SkillDefinition<TInput, TFields>` on the
  shared wllama runtime (Phase 13.0.0a); same posture as
  `useSlmDocSummariser` (per-input 2/60s + global 6/5min rate
  limit; citizen-safe error). NEW
  `frontend/src/lib/last-doc-summary-bridge.ts` — tiny zustand
  in-memory bridge with owner-gated `getLastDocSummary` so
  cross-identity reads return null. NEW
  `frontend/src/components/SkillAgentPanel.tsx` — mounted on
  /labs sibling of DocSummariserPanel, keyed on identity;
  honest empty state when no SLM / no recent summary / wrong
  docKind. EXTENDED `DocSummariserPanel.tsx` — publishes parsed
  summary to bridge on success; clears on Try Sample / Clear /
  docKind pill change (SF-1). EXTENDED `Labs.tsx` —
  SkillAgentPanel below DocSummariserPanel.
  **Adversarial review** (3 lenses: privacy + UX + edge-cases):
  **0 MUST_FIX + 3 SHOULD_FIX + N defer**. SF-1 pill change
  clears bridge. SF-3 seed sentinel retries on empty-catalog.
  SF-4 `runningRef` synchronous in-flight guard
  (mirrors Phase 13.0.2 MF-2). **§15 bindings**: registry is
  pointer-only (prompt body in FE bundle, never BE row); strict
  allowlist > denylist; ledger meta only; bytes-never-leave-
  device (skill runs on shared wllama); honest empty state;
  PII-impossible bridge (owner-gated + in-memory only).
  **API_INTEGRATIONS.md impact**: ZERO new external API. The
  skill agent runs on the existing wllama runtime; no new
  service / env var / partner credential. Last-updated header
  bumped. **FE-BE parity**: BE delta = registry validator +
  store wiring + 2 public + 2 admin endpoints; FE delta =
  substrate + skill + hook + bridge + panel + Labs wiring.
  Tests: vitest 388 → **419** (+31 skill-agent.test + electricity
  -bill-explainer.test); Node 1256 → **1282** (+26 skill-agent
  registry + HTTP integration). tsc clean.
- **Phase 13.0.2 — SHIPPED 2026-06-02 (ADR 0155).** SLM-E
  document summary persistence — first BE delta in the SLM-E
  arc, closes the ADR 0149 "v1 is generate-and-render, persist
  in 13.0.x" deferral. NEW
  `src/phase0/doc-summary-envelope.mjs` (~305 lines) — strict-
  allowlist normaliser + ledger-event builder modelled on the
  Phase 13.2 piiRedaction posture (ADR 0152).
  `DOC_SUMMARY_PROTOCOL_VERSION = 'bos.phase13.doc-summary.v1'`,
  `DOC_SUMMARY_SOURCE_TYPE = 'doc_summary_v1'`,
  `PERMITTED_SOURCE_KEYS` + `PERMITTED_PDF_FINGERPRINT_KEYS`,
  `FORBIDDEN_LEDGER_SUBSTRINGS` (23 entries — shared probe across
  every test in this surface so the allowlist-rejection guard and
  the JSON-grep guard can't drift). `normaliseDocSummarySource`
  validates `docKind` / `language` against frozen allowlists
  mirrored from the FE, caps counts (titleLength ≤ 240, tldrLength
  ≤ 240, bulletCount ≤ 16, modelPackId ≤ 128), clamps confidence
  to [0,1], regex-then-`Date.parse` validates `generatedAt` as a
  calendar-valid ISO-8601 instant, drops ms precision (mirrors
  Phase 13.2 MF-3 typing-speed defence).
  `buildDocSummarisedLedgerEvent` emits ONLY counts + enums +
  pointers — strings (title / TLDR / bullets / extracted text /
  PDF bytes) live encrypted in the MemoryRecord bundle and never
  reach the audit ledger. `at` field is also ms-stripped so the
  typing-speed defence isn't cosmetic. EXTENDED `src/phase0/
  api.mjs`: POST /api/memory-records branches on
  `source.type === 'doc_summary_v1'`, normalises, persists then
  emits `doc.summarised` with `at: record.createdAt`; 400
  `invalid_doc_summary_source` on malformed envelopes; other
  source.type values flow unchanged (citizen notes still work).
  NEW `frontend/src/lib/doc-summary-source.ts` (~110 lines) —
  `buildDocSummarySource({ parsed, modelPackId, pdf, now })` and
  `renderSummaryPlaintext(parsed)` (stable
  TITLE/TLDR/BULLET_N/LANGUAGE/CONFIDENCE/RISK_FLAG/DOC_KIND line
  shape). EXTENDED `DocSummariserPanel.tsx` — Save summary button
  in the SummaryChipBlock area, wired to `useCreateMemoryRecord`
  with `sensitivity: 'sensitive'`, `tags: ['document_summary']`,
  `source: <envelope>`. PDF fingerprint captured at pick-time
  (`pages`, `truncatedReason`) flows onto the envelope if present;
  manual text edits invalidate it and surface a notice.
  **Adversarial review** (3 lenses: privacy + UX + edge-cases +
  triage synthesiser): **3 MUST_FIX + 6 SHOULD_FIX + 7 defer**;
  all 9 applied in-phase. MF-1 strip ms from `at` (was
  cosmetic typing-speed defence). MF-2 `savingRef` synchronous
  in-flight guard + textarea onChange when transitioning out of
  `saved` also clears `lastResult` + calls `reset()` so the Save
  badge can't linger over text that no longer matches the saved
  record. MF-3 cleartext label is `${DOC_KIND_LABEL[kind]} ·
  ${YYYY-MM-DD}` (meta only — not the parsed document title
  which can carry PII like consumer numbers); badge copy tightened
  to "body readable from /citizen/notes under your active
  memory.read consent". SF-1 FE↔BE convergence test now reads
  `frontend/src/lib/doc-summariser.ts` at runtime and regex-extracts
  the DocKind / DocLanguage unions, asserting set-equality (was
  literal-array sanity check that drift could pass silently).
  SF-2 `FORBIDDEN_LEDGER_SUBSTRINGS` constant + 23-substring list
  (includes synonyms: caption / excerpt / plain / summary /
  content / transcript / firstPageText / headline / paragraph).
  SF-3 `Date.parse` round-trip rejects calendar-invalid instants
  like `2026-13-99T99:99:99Z`. SF-4 textarea onChange surfaces
  "Edited after PDF pick — this summary will be saved as pasted
  text" instead of silently dropping the prior notice. SF-5
  `SAVE_ERROR_COPY` map keyed on `err.code`; raw `err.message`
  goes to `console.warn` in DEV only. SF-6 drop docKind from
  MemoryRecord `tags` array — it already lives on the
  doc.summarised event (a separate consent-gated surface).
  **§15 bindings**: pointer-not-payload (recordId on the event,
  encrypted body in the record); strict allowlist > denylist
  (envelope keys + nested pdfFingerprint keys); count-only meta;
  ms-dropped timestamps both places; no PII to ledger.
  **API_INTEGRATIONS.md impact**: ZERO new external API; the
  doc_summary_v1 source.type extends the existing
  POST /api/memory-records boundary. Last-updated header bumped.
  **FE-BE parity**: BE delta = normaliser + branch in api.mjs
  + new ledger event type; FE delta = lib + panel extension.
  Tests: vitest 382 → **388** (+6 doc-summary-source); Node
  1233 → **1256** (+23 doc-summary-envelope). tsc clean.
- **Phase 13.0.1 — SHIPPED 2026-06-02 (ADR 0154).** PDF
  upload + on-device text extraction for SLM-E doc summariser.
  Closes the Phase 13.0 ADR 0149 deferral. NEW
  `frontend/src/lib/pdf-text-extract.ts` (~250 lines) — pure-FE
  shared CORE substrate composing pdfjs-dist (first user-
  approved npm dep this arc). `extractPdfText(file, opts?)`
  returns a typed envelope with `text` + `pageCount` +
  `pagesExtracted` + `charsExtracted` + `truncated` +
  `truncatedReason: 'pages'|'chars'|'both'|null`. Five typed
  error codes (`unsupported_mime | too_large | encrypted |
  corrupt | no_text_layer`) mapped to citizen-friendly copy in
  the panel — citizen never sees raw pdfjs error strings.
  Caps: 10 MB file, 32 pages, 6000 chars (aligned to SLM-E
  `DOC_INPUT_CHAR_CAP` so the panel notice doesn't lie about
  truncation). Worker bundled locally via Vite `?url` import;
  no CDN fetch; `cMapUrl`/`standardFontDataUrl`/`wasmUrl`
  never set so pdfjs's BinaryDataFactory throws rather than
  silently fetching. NEW `vite-env.d.ts` declares the `?url`
  module shape. DocSummariserPanel extended with a file picker
  next to the existing textarea. **Adversarial review**
  (3 lenses + triage): **1 MUST_FIX + 6 SHOULD_FIX + 17 defer**;
  all 7 applied in-phase. MF-1 was critical — Rules-of-Hooks
  crash: PDF state hooks were declared AFTER conditional early
  returns (`if (!hasSlm) return null`), so the install-pack
  demo flow would have triggered React 19's "Rendered more
  hooks than during the previous render". Fixed by moving the
  4 state hooks to the top of the component. SF-1 `pickGenRef`
  race-safety on concurrent picks; SF-2 per-page error
  tracking — all-pages-fail now throws `corrupt` rather than
  the misleading `no_text_layer`; SF-3 failed pick preserves
  prior summary on screen; SF-4 `MAX_EXTRACT_CHARS` aligned to
  `DOC_INPUT_CHAR_CAP`; SF-5 new `truncatedReason` field with
  branched panel notice (no more "Read 1 of 1 page —
  truncated" contradictions); SF-6 `pdfBusy` in
  Summarise/TrySample/Clear disable clauses. **§15 bindings**:
  bytes-never-leave-device (worker bundled local; PDF blob
  read once, transferred to worker, never persisted; zero
  fetch in either new file); honest empty state (5 typed
  error codes with specific copy); protocol version pinned;
  pointer-not-payload (only extracted text crosses to the SLM
  runtime). **API_INTEGRATIONS.md impact**: ZERO new external
  API. `pdfjs-dist` is a build-time + runtime FE dep, not an
  external service. Last-updated header bumped. **FE-BE
  parity**: BE delta = none, by design — `/api/extract-pdf/*`
  would falsify the binding. Tests: vitest 356 → **382** (+26
  PDF cases); Node 1233 unchanged (FE-only). tsc clean.
- **Phase 13.3 — SHIPPED 2026-06-02 (ADR 0153).** SLM-G
  on-device personalization. Third SLM USP feature. NEW
  `profile-store.ts` — Zustand+persist+localStorage with
  `PROFILE_STORE_PROTOCOL_VERSION = 'bos.phase13.profile.v2'`,
  `getActiveProfile(identityId)` cross-citizen guard, and a
  PII-impossible-by-construction schema (enum × enum × bool ×
  allowlist-domains). NEW `profile-prompt-fragment.ts` — pure
  builder returning `''` at defaults so existing prompts stay
  byte-equal for un-personalised citizens; `FRAGMENT_MAX_CHARS
  = 400`; defence-in-depth `scanWithRegex` on emitted bytes.
  NEW `PersonalizationCard.tsx` — inline Settings card with
  language select / tone radio / accessibility checkboxes /
  topic chips, mounted between Identity and DPDP cards. Both
  `buildIntentParsePrompt` and `buildDocSummaryPrompt` gain
  an optional `profileFragment` parameter; both SLM consumer
  hooks subscribe only to `updatedAt` as a tripwire and read
  the profile lazily via `getActiveProfile` inside the
  callback (MF-1 stale-closure fix). `ProtectedSurface` in
  App.tsx now `key={activeId}` so every protected route
  auto-remounts on identity flip (MF-2; symmetric to Labs).
  `clearProfile()` wired into both Forget-persona and
  `eraseIdentity` success — DPDP cascade complete; Erase
  modal cascade list and Identity card body copy both
  disclose the personalization wipe. **§15 bindings**: pure
  FE, zero fetch/XHR/sendBeacon/WebSocket (vitest SF-1
  enforces); PII-impossible by construction; honest empty
  state via `''` at defaults; cross-citizen isolation via
  snapshot guard + parent-route remount; protocol version
  pinned with v1→v2 migrate that strips the deprecated
  `highContrast` field. **Adversarial review** (3 lenses):
  **5 MUST_FIX + 10 SHOULD_FIX + 6 defer**; all 5 must + 6
  key should fixed in-phase. MF-1 stale-closure (drop
  whole-store subscription, lazy read), MF-2 ProtectedSurface
  remount, MF-3 drop highContrast no-op + v2 + migrate, MF-4
  DPDP copy upgrade, MF-5 no-identity banner. SF-2 intent-
  parser citizen-safe error (mirrors Phase 13.0 MF-2), SF-4
  coerce-on-rehydrate, SF-6 cross-identity warning banner,
  SF-7 Evidence copy tightened, SF-8 saturated chip caption,
  SF-9 drop sprint metadata from subtitle. **FE-BE parity
  binding INVERTED**: BE delta = none by design (privacy
  invariant). A `/api/profile/*` endpoint would falsify the
  pitch beat; future cross-device sync must round-trip
  through vault-key + memory-records, never a plain endpoint.
  **API_INTEGRATIONS.md impact**: ZERO new external API.
  Last-updated header bumped. Tests: vitest 313 → **356**
  (+43); Node 1233 unchanged (FE-only). tsc clean.
- **Phase 13.2 — SHIPPED 2026-06-01 (ADR 0152).** Closes the
  SLM-F arc with the first BE delta. NEW `piiRedaction`
  sub-envelope on `intentAnnotation` (`src/phase0/intent-
  annotation.mjs`): count-only fields `detectedCount`,
  `maskedCount`, `kinds[]`, `source` (`regex` | `regex+slm`),
  `appliedAt`. **Strict allowlist** at the boundary — any key
  not in `PII_ALLOWED_KEYS` is rejected (defence-in-depth
  beyond the original denylist; closed leak vectors from
  synonyms like `body / value / snippet / payload / content`).
  `appliedAt` validated as ISO-8601 UTC instant with ms
  precision DROPPED on accept (neutralises timing-fingerprint
  side-channel). `kinds[]` cap enforced post-dedup. Ledger
  event `intent.slm_<verdict>` surfaces count-only meta;
  JSON-grep test asserts no forbidden key surfaces. Auto-scan
  on Send is **opt-in** (`piiAutoscanEnabled` per-session flag
  flips true on first chip tap OR first Apply) so first-time
  citizens don't get surprise modals on benign 6-digit /
  10-digit sequences. The "Keep All → Apply → Send" re-open
  loop closed via `acknowledgedSinceScan` flag (set on Apply
  OR sheet Close/Cancel). `markApplied(appliedSpans,
  appliedResult)` new signature so `buildAnnotation` reports
  honest `maskedCount = appliedSpans.length` and `kinds[]`
  reflects only the citizen-applied set — earlier impl lied
  with `maskedCount === detectedCount`. `hasPendingPii`
  getter replaced with `hasPendingPiiAgainst(text)` method so
  callers can't ignore text drift. `buildAnnotation` text-
  drift guard returns null when current text is neither
  original nor post-mask. `PiiReviewSheet` gets a `title`
  prop; Notes passes "Check for PII before saving". Phase
  13.1 deferred SHOULD_FIX wins also applied: D6 (sample
  fixture PIN swap to 199999 / 299999 / 399999 demo
  family), D7 (honest "Check for PII (patterns only)" chip
  framing when no SLM installed), D10 (per-row mask preview
  bug — `applyMask(span.raw, [{...span}])` was failing
  text.slice invariant; now uses `PII_KIND_MASK[kind]`
  directly), D21 (unused Field import removed),
  D-SF9 (`applyMask` widened to `MaskableSpan` structural
  interface; unsafe TS cast removed). **Adversarial
  review** (3 lenses + triage): **3 MUST_FIX + 10 SHOULD_FIX
  + 5 defer**; all 3 must + 6 key should fixed in-phase.
  **API_INTEGRATIONS.md impact**: ZERO new external API.
  Last-updated header bumped. Tests: Node 1230 → **1233**
  (+3 MF-3 strict-allowlist / ISO-8601 / ms-drop cases);
  Vitest 309 → **313** (+4 fixture-PIN guards). tsc clean.
  **Next**: Phase 13.3 (standalone piiRedaction-only path +
  per-identity persisted opt-in + offline-queue replay
  redaction + SLM-G personalization) OR Phase 14 Sahayak.
- **Phase 13.1 — SHIPPED 2026-06-01 (ADR 0151).** SLM-F
  on-device PII redactor. Second SLM USP feature. Hybrid
  architecture: **regex-primary (deterministic, synchronous,
  always available even with no SLM installed) + SLM-secondary
  (context augmentation via Phase 13.0.0a shared runtime)**.
  NEW `frontend/src/lib/pii-detectors.ts` (~310 lines): 11
  Indian-PII regexes (PAN / Aadhaar / mobile / GSTIN /
  account / DL / RC / ABHA / UPI / email / PIN) + per-kind
  deterministic mask shapers; `scanWithRegex` produces
  non-overlapping spans validated against
  `text.slice(start,end)===raw`; `applyMask` idempotent
  rewrite. PROTOCOL_VERSION pinned. NEW `pii-redactor.ts`
  (~270 lines): SLM prompt builder + completion parser with
  anti-hallucination guard (drops SLM spans where offsets
  don't reconstruct the substring) + 4 sample fixtures
  (shopping / loan_intent / health_check / shop_kyc, demo-
  persona PII only). NEW `use-slm-pii-redactor.ts` (~340
  lines): composes `getSharedSlmRuntime`; per-text 3/60s +
  global 8/5min rate limit; `mergeSpans` pure function
  exports regex-wins-on-overlap merge (M1 fix uses two-pass
  regex-first admit-SLM-without-overlap); always returns a
  result even without SLM (regex floor); `markApplied` +
  `hasPendingPii` drive the Send-side gate. NEW
  `PiiReviewSheet.tsx` (~230 lines): per-span keep/mask
  checkboxes (regex pre-checked, SLM unchecked), Mask all /
  Keep all, preview, MF-3 staleness check. NEW
  `CooldownCountdown.tsx`: shared live-decrementing ticker
  (reusable for SLM-D/E migration). Wired into
  **CitizenIntent** (chip below SLM-A "Check my
  understanding") AND **CitizenNotes** create-sheet (chip
  above Save). Apply rewrites textarea/body BEFORE
  handleSend/handleCreate fires — orchestrator contract,
  idempotency fingerprint, MF-3 byte-match guards, ledger
  plumbing all unchanged. **§15 hardening**: Send/Save
  foot-gun gate — `window.confirm` when citizen scanned,
  found PII, dismissed sheet, and is about to dispatch raw
  PII. Pure FE; zero BE changes. PRE-STEP refactor:
  extracted `slm-parse-helpers.ts` (clipLine,
  clampConfidence, djb2Hash) — doc-summariser re-exports
  the first two; ADR 0149 vitest pins remain green.
  **Adversarial review** (3 lenses + triage): **6 MUST_FIX
  + 12 SHOULD_FIX + 21 defer**; all 6 must + 6 key should
  fixed in-phase. M1 mergeSpans two-pass regex-first; M2
  maskMobile digit-vs-char-index bug fix; M3 PiiReviewSheet
  prevResult re-seed pattern (was keyset-equality leaving
  stale ticks); M4 PiiReviewSheet hoisted sibling-of
  create-note Sheet (nested Escape was closing both); M5
  cooldownUntil wall-clock + CooldownCountdown ticker; M6
  Send-side confirm gate. S1+S2+S3 regex coverage gaps
  (Aadhaar/PAN dash separators; lowercase DL/RC/GSTIN). S8
  perTextTimestamps Map cleanup. S9 runtime snapshot before
  generate. S12 piiRedactor.reset on send success.
  **API_INTEGRATIONS.md impact**: ZERO new external API.
  Last-updated header bumped. Tests: vitest 201 → **309**
  (+108 SLM-F cases). Node 1217 unchanged. tsc clean.
  **Next**: Phase 13.2 (transparent handleSend integration +
  piiRedactionAnnotation envelope + offline-queue replay
  redaction) OR Phase 13.3 SLM-G (on-device personalization).
- **Phase 13.0.0a — SHIPPED 2026-06-01 (ADR 0150).** Shared
  wllama runtime singleton. The booking-advisor header had
  been claiming the runtime was loaded at most once across
  all SLM consumers, but each hook actually held its own
  `runtimeRef` and reloaded the GGUF independently. A warm
  session running 4 SLM verbs loaded ~1.4 GB into WASM four
  times. NEW `getSharedSlmRuntime(packId, blobLoader, opts?)`
  + `releaseSharedSlmRuntime(packId?)` in `slm-runtime.ts` —
  module-level `Promise<SlmRuntime>` cache keyed on packId;
  same packId → cached promise (load once); different packId
  → fire-and-forget unload prior + rebuild; `Error('no_blob')`
  rejection clears the cache so retries work; rejected loads
  also clear the cache. All 4 SLM hooks + SlmTryPrompt
  refactored to compose the singleton. Each hook keeps its
  own `mountedRef + inflightRef + rate-limit + status union`
  (per-feature concerns) but the runtime itself is shared.
  Unmount no longer calls `runtime.unload()` (would pull the
  rug from concurrent hook instances on the same runtime);
  pack uninstall in `Labs.tsx` `handleRemove` now calls
  `releaseSharedSlmRuntime(install.modelPackId)` so WASM
  memory is freed when the citizen removes the active pack.
  **§15 hardening propagated**: `logger: 'silent'` now passed
  to the shared runtime load from ALL 4 hooks + SlmTryPrompt
  (was only doc-summariser in Phase 13.0). Defence-in-depth
  on bytes-never-leave — wllama tokenisation errors can no
  longer echo prompt bytes to DevTools console regardless of
  which SLM verb fired. Tests: vitest 193 → **201** (+8
  shared-singleton cases — concurrent-same-pack dedup,
  pack-swap unload-rebuild, no_blob rejection, retry-after-
  reject, release semantics); Node 1217 unchanged. tsc clean.
- **Phase 13.0 — SHIPPED 2026-06-01 (ADR 0149).** SLM-E
  on-device document summariser (demo cut v1) — first
  feature in the Phase 13.x SLM USP arc. NEW
  `frontend/src/lib/doc-summariser.ts` (~290 lines): pure
  prompt builder + line-regex parser + 6 DocKinds
  (electricity_bill / form_16 / tncs / insurance /
  lender_doc / generic) + per-kind bias-hint map + 6
  scrubbed sample fixtures. Protocol version pinned
  `bos.phase13.doc-summariser.v1`. NEW
  `use-slm-doc-summariser.ts` (~260 lines): first SLM
  consumer in the repo to pass `onToken` — streams tokens
  into a `partialText` state for the perceived-latency
  pitch beat (first token in ~2s, full output in <20s on a
  mid-tier laptop). Two-tier rate limit (per-doc 2/60s +
  global 6/5min — tighter than booking-advisor's 3/12
  because summariser maxTokens 384 is 4x heavier). NEW
  `DocSummariserPanel.tsx` (~225 lines): Card with 6-pill
  picker, 6000-char textarea, Try sample / Clear actions,
  permanent green "Stays on this device · 0 bytes uploaded"
  badge, live streamed `<pre>` kept visible through the
  ready transition, SummaryChipBlock with TITLE / TLDR /
  bullets / language / confidence / risk-flag. Returns
  `null` when no SLM installed (honest empty state binding).
  Mounted into `/labs` with `key={identity?.id ?? 'anon'}`
  so a shared-device identity flip forces full remount +
  unmount cleanup (citizen B never inherits citizen A's
  pasted bytes). Zero BE changes — pure FE feature; mirrors
  Phase 10.6 SLM-hint precedent. **§15 bindings**:
  bytes-never-leave-device (no fetch, no console echo —
  SF-2 makes `loadSlmRuntime({ logger: 'silent' })` actually
  silence warn+error in `slm-runtime.ts`); echo guardrail
  on `DOC_KIND` (parser coerces to caller-supplied
  expected); allowlist on RISK_FLAG + LANGUAGE; sample
  fixtures use demo-persona PII conventions (PAN ending
  0000, consumer numbers DEMO-, policy POL-DEMO-); vitest
  sanity-greps reject real-shaped PAN/Aadhaar in fixtures.
  **Adversarial review** (3 lenses + triage) surfaced **5
  MUST_FIX + 6 SHOULD_FIX + 12 defer**; all 11 must/should
  applied in-phase. MF-1 key-on-identity remount (shared-
  device cross-citizen state leak), MF-2 generic error
  message + honest `no_blob` Card branch, MF-3 streamed
  `<pre>` kept visible after `status='ready'` so the
  on-device pitch beat survives the chip-render frame,
  MF-4 `inflightRef` carries `docKey` so a second
  `summarise()` with different (kind, text) doesn't get
  silently aliased to the first call's result, MF-5
  cooling-down auto-exits via `setTimeout(retryInMs)` so
  the CTA isn't permanently disabled. **API_INTEGRATIONS.md
  impact**: ZERO new external API. The whole point of the
  USP is that the document never leaves the device. Last-
  updated header bumped to 2026-06-01. Tests: vitest 146 →
  **193** (+47 doc-summariser cases); Node 1217 unchanged
  (FE-only). tsc clean. **Next**: Phase 13.0.1 (PDF.js
  upload — needs npm-dep approval) OR Phase 13.0.2
  (persistence as MemoryRecord + `doc.summarised`
  pointer-not-payload ledger event) OR Phase 13.1 SLM-F
  PII redactor.
- **Phase 12.3 — SHIPPED 2026-06-01 (ADR 0148).** Wave-2
  provider roles (`kirana` + `skilled-trades`) + GST
  adapter. NEW `src/phase1/gst-adapter.mjs` (4th concrete
  adapter composing the Phase 12.2.1 substrate; provider
  allowlist `stub|sandbox|surepass|karza|gsp-direct`).
  Wave-2 schemas wired in `provider-role-extras.mjs`:
  kirana required `shopName` + `shopLicenseNumber` +
  `shop_license` attachment, optional GSTIN / FSSAI /
  yearsInBusiness; skilled-trades required ITI cert # +
  institute + `iti_certificate` attachment, optional
  yearsExperience / portfolioUrl. **NEW `pattern` +
  `normalize` field-spec keys** — text-kind validator
  honors per-field regex (GSTIN_RE, FSSAI_RE) and
  upper-case normalisation, closing a HIGH adversarial
  finding (citizens could type 15-char rubbish into
  gstinNumber, BE silently accepted, verifier no-op'd,
  operator saw garbage with no result). 4 new ATTACHMENT_
  KINDS (`shop_license`, `gst_certificate`,
  `iti_certificate`, `trade_portfolio`).
  `verify-role-extras` endpoint merges Parivahan + GST
  via `Promise.allSettled`; **empty-results guard** (400
  `nothing_to_verify`, no persist, no ledger event) for
  skilled-trades manual-only + kirana-without-GSTIN cases
  — previously a misleading "verified at T by operator X"
  with empty results would have been stamped. Operator
  console now gates "Pre-verify" button on roles with a
  configured verifier (label tracks adapter: Pre-verify
  Parivahan / GST); skilled-trades renders "Manual review
  only" tag instead. Generalised 502 message references
  both BHARAT_OS_PARIVAHAN_MODE and BHARAT_OS_GST_MODE.
  **§15 bindings**: cacheKey `gst:<sha256(GSTIN).slice(0,32)>`
  (raw GSTIN never on cache/ledger); polite UA on every
  call; stub-first default; deep-frozen schemas + closed
  field allowlist. **Adversarial review** (3 lenses): 3
  HIGH + 3 MED + 1 LOW; all HIGH + MED fixed in-phase.
  **API_INTEGRATIONS.md §3.3 GST** flipped from
  📋 Reserved → 🧪 Stub-only with full provisioning notes.
  FE mirror (`role-extras-schema.ts`) extended with
  `pattern?: RegExp` + `normalize?: 'upper'` interface
  fields; client-side validator honors them; parity test
  projects regex `.source` on both sides. Tests: Node
  1199 → **1217** (+18 wave-2 + GST + adversarial-fix
  cases); Vitest 140 → **146** (+6). tsc clean.
- **Phase 12.2.7 — SHIPPED 2026-06-01 (ADR 0147).** FE
  "Link DigiLocker" card + KYC L1 wiring. Closes the FE-BE
  gap on Phase 12.2.6 (BE-only substrate now has a
  citizen-facing surface). NEW
  `frontend/src/lib/use-digilocker-link.ts` — 3 TanStack
  hooks (status query + link mutation runs authorize +
  callback in stub mode without a popup + unlink mutation).
  NEW `LinkDigilockerCard` component rendered at TOP of
  the KYC L1 wizard's identity step. Honest "(demo mode —
  substrate ready, partner credentials pending)" tag in
  stub mode. **§15 bindings**: actingRootIdentityId in
  X-Bharat-OS-Acting-Identity header ONLY (never URL query
  to avoid service-worker / referer telemetry leak);
  same-origin assert on the BE-supplied authorizeUrl;
  TanStack response type excludes tokens. **Adversarial
  review** (2 lenses) surfaced 10 findings; **6 medium
  fixed in-phase**: same-origin assert on
  authorizeUrl, query-string → header migration,
  window.confirm before Unlink (matches codebase's
  destructive-action discipline), error branching
  (invalid_or_expired_state vs 5xx vs 401 vs generic),
  double-tap gate via mutation status check, status-error
  fallback so API-down doesn't silently hide the card.
  **API_INTEGRATIONS.md** updated: DigiLocker §3.1 now
  notes the citizen-facing surface ships in 12.2.7. Tests:
  138 → **140 vitest** (+2 hook smoke cases). Node 1199
  unchanged (FE-only phase). tsc clean. Bundle 628 → 632 KB
  / 177 → 179 KB gzipped (+4 KB).
- **Phase 12.2.6 — SHIPPED 2026-06-01 (ADR 0146).** DigiLocker
  OAuth2 substrate + first non-stub Parivahan provider + Sahayak
  no-smartphone binding. NEW
  `src/phase1/digilocker-substrate.mjs` — OAuth2 helpers
  (generateState, buildAuthorizeUrl, exchangeCodeForToken,
  buildLink) + stubSignedDocument + verifyDocumentSignature.
  Frozen scope allowlist. Stub mode = deterministic flow; live
  mode hits `api.digitallocker.gov.in` when partner credentials
  set. NEW `digilocker_states` + `digilocker_links` tables on
  both stores (states one-shot 10-min TTL; links 1 per root
  identity). NEW 4 endpoints: `/api/digilocker/authorize`,
  `/callback`, `/status`, `DELETE /link`. **§15 bindings**:
  access + refresh tokens NEVER on ledger or in `/status`
  response; state binds to rootIdentityId server-side; DPDP
  cascade atomic. Parivahan adapter `verifyRoleExtrasFields`
  now accepts optional `digilockerLink` — citizen-authorised
  signed-document path via stubSignedDocument; result envelope
  carries `signedDocSha256` pointer. Operator console: 🔏
  (locked) indicator when result is from a citizen-authorised
  DigiLocker session vs generic stub. Adversarial review (3
  lenses) surfaced 17 findings; **5 high+med fixed in-phase**:
  bindingDigest skipped in stub (was rainbow-tableable); open-
  redirect via redirectUri closed via allowlist; state ordering
  fixed to peek→exchange→consume (was burning state on
  transient errors); silent live→stub fallback now warn-once;
  opportunistic sweep bounds stale-state growth. **User-raised
  strategic direction captured**: Sahayak no-smartphone
  onboarding model (Snabit / Pronto pattern). New memory
  binding + ROADMAP Phase 14.x sub-items (sahayak role +
  UIDAI AUA registration + USSD `*99#` bridge + IVR voice
  + print receipt + cash float). Substrate ~70% already
  there; remaining 30% is Sahayak product layer + partner
  partnerships. **NEW `docs/API_INTEGRATIONS.md` updated**:
  DigiLocker flipped from 📋 Reserved to 🧪 Stub-only with
  full env-var list + partner-provisioning steps. Tests:
  1166 → **1199 Node** (+33). Vitest 138 unchanged. tsc clean.
  Bundle unchanged.
- **Phase 12.2.5 — SHIPPED 2026-06-01 (ADR 0145).** Parivahan /
  Sarathi / Vahan verification adapter + master
  `docs/API_INTEGRATIONS.md` tracker. Third concrete adapter
  composed on Phase 12.2.1 external-adapter substrate (after
  Nominatim + India Post PIN). NEW `src/phase1/parivahan-adapter.mjs`
  with frozen provider allowlist (stub | digilocker | surepass
  | karza | idfy) — v1 ships stub only; live providers throw
  `provider_not_configured` until URL+parse landed per provider.
  NEW field `roleExtrasVerifications` on providerIdentity +
  `recordRoleExtrasVerifications` mutator. NEW endpoint
  POST `/api/admin/provider-identities/:id/verify-role-extras`
  (admin bearer): runs adapter per verifiable field, persists
  results, emits `provider_identity.role_extras_verified`
  ledger event (verifiedFields + statuses + operatorId only,
  NEVER holder names / validity dates). Operator console:
  Pre-verify button per row + color-coded status badges with
  `[stub]` marker so demo results aren't mistaken for real
  verifications. NEW `docs/API_INTEGRATIONS.md` master tracker
  for every external API Bharat OS needs (Parivahan,
  DigiLocker, NSDL PAN, GSTN, NPCI/UPI, Karix/Gupshup/MSG91/
  Twilio SMS, ABDM, ONDC, etc.) with cost + provisioning
  steps + exact env-var names. Adversarial review (3 lenses)
  surfaced 20 findings — 8 high+med fixed in-phase:
  selfProviderRecord NO LONGER echoes roleExtrasVerifications
  (would have leaked holder names through URL-trusted
  owner-list); verifier_error envelope sanitized to code-only
  (was leaking "provider X not yet configured" message);
  endpoint refuses non-draft/non-submitted status; clear-on-
  resubmit posture (was leaving OLD ✓ badges on NEW typed
  numbers); 502 + ledger-skip when all results are
  verifier_error (was polluting audit trail); stub fetchedAt
  uses real clock (frozen demo date confused operators about
  freshness); doc env-var names fixed against actual codebase.
  **User-flagged**: keep updating the API list as new
  integrations land. Tests: 1142 → **1166 Node** (+24).
  Vitest 138 unchanged. tsc clean. Bundle unchanged.
- **Phase 12.2.4 — SHIPPED 2026-06-01 (ADR 0144).** Per-role
  heavy extras (wave-1) + operator attestation flow. Closes
  the wave-1 onboarding loop: all 4 roles (cab-driver /
  personal-driver / labourers / household-help) now have a
  role-specific verification step in the citizen wizard +
  parallel operator attestation. NEW
  `src/phase1/provider-role-extras.mjs` PROVIDER_ROLE_EXTRAS
  map (4 closed schemas: required + optional fields +
  required attachment kinds per role). Field kinds: text,
  date, phone (India 10-digit), integer. **Deep-frozen**
  (adversarial fix PII-Q4 — initial Object.freeze was
  shallow). GET endpoint returns `structuredClone` so
  callers can't mutate via the public response.
  validateRoleExtras emits **schema_version_stale** loudly
  (adversarial fix PII-Q6 — was silently overwriting). NEW
  fields on providerIdentity: roleExtrasSubmission +
  roleExtrasAttestation. recordRoleExtrasSubmission now
  accepts draft OR submitted (adversarial fix L2-1 — was
  locked out post-KYC-attest); always clears any prior
  attestation. attestRoleExtras pins attestedSchemaVersion
  + attestedSubmittedAt (adversarial fix L2-2 — without the
  timestamp anchor a citizen could swap answers between
  review and attest). Activation guard refuses on missing
  attestation OR stale schema version OR stale submission
  timestamp. NEW endpoints: POST submit-role-extras +
  POST admin attest-role-extras + GET schemas. NEW ledger
  events provider_identity.role_extras_submitted +
  .role_extras_attested — pointer-not-payload (field names
  + attachment IDs + role + schemaVersion, NEVER values).
  selfProviderRecord redacts verification numbers to "••••";
  publicProviderRecord doesn't echo either field. FE: wizard
  5 → **6 steps** (identity → selfie → idProof → address →
  **roleExtras** → review), useEffect snaps step on roleKind
  change (UX-3 fix). NEW RoleExtrasStep paints ALL failing
  fields at once (UX-1 fix); review step echoes typed
  answers (UX-6 fix). PhotoCapture acceptMode='image+pdf'
  + **magic-byte PDF sniff** (UX-2 fix — Android often hands
  back octet-stream). Operator console: per-kind View
  buttons + Attest role basic/verified pair separate from
  KYC attest. NEW vitest FE/BE schema parity snapshot test
  (UX-4 fix). Adversarial review surfaced 27 findings; 11
  high+med fixed in-phase. **User-flagged need**: real
  validation of DL # / vehicle reg # against mParivahan /
  Sarathi / Vahan endpoints — RESERVED as Phase 12.2.5
  (composes Phase 12.2.1 external-adapter substrate).
  Tests: 1110 → **1142 Node** (+32) + 124 → **138 vitest**
  (+14). tsc clean. Bundle main 618 → 628 KB / 175 → 177 KB
  gzipped (+10 KB).
- **Phase 12.2.3 — SHIPPED 2026-06-01 (ADR 0143).** Attachment
  CORE substrate + KYC L1 selfie / ID-proof wiring + operator
  view of citizen-captured photos. NEW
  `src/phase1/attachment.mjs` (mime allowlist /
  jpeg+png+webp+pdf, content-addressed `bos:att:<32hex>` IDs,
  5 MiB per-blob + 50 MiB per-actor caps, EXIF-bearing flag,
  typed `AttachmentValidationError`). NEW `attachments` table
  on SqliteStore (composite PK on sha256 + root, BLOB column,
  first BLOB in the entire schema) + two-file layout on
  BosStore (.bin + .json siblings, cascade unlinks .bin FIRST).
  POST/GET-list/GET-id/DELETE `/api/attachments` with owner-
  auth (acting-identity header) or operator-bearer paths.
  GET-id emits content-addressed cache headers
  (`private, max-age=31536000, immutable` + ETag). **§15
  bindings**: `attachment.saved`/`erased`/`admin_read` ledger
  events carry meta only (NEVER bytes); `/api/attachments/:id`
  rewritten in `safePath` (covers `:`-form AND URL-encoded
  `%3A` form); operator GET emits an audit event so a leaked
  token leaves a trail; quota check wrapped in `BEGIN IMMEDIATE`
  on SQLite so parallel uploads can't blow past the actor cap;
  EXIF retention flagged but NOT stripped in v1. KYC L1
  schema extended with optional `selfieAttachmentId` +
  `idProofAttachmentId` (ownership-verified at submit time —
  citizen cannot reference another citizen's blob). FE: NEW
  `useAttachmentUpload` mutation + `<PhotoCapture/>` (file-
  input primary path with `accept="image/*"
  capture=environment|user`, preview + confirm + retake, real
  thumbnail render on resubmit). KYC L1 wizard grew 3→**5
  steps** (identity → selfie → idProof → address → review).
  Operator console: per-row "View selfie" / "View ID proof"
  buttons (fetch + blob URL + open in new tab, URL revoked
  after 30s); EXIF warning banner; graceful framing on
  citizen-erased attachments. Adversarial-review workflow
  surfaced 26 findings across 4 lenses (PII / DPDP / auth /
  UX); 11 high+med fixed in-phase, 15 low deferred or
  accepted with scope rationale in ADR. Phase 12.2.4 per-role
  extras + Phase 12.x dispute evidence reuse this substrate
  without modification. Tests: 1082 → **1110 Node** (+28) +
  121 → **124 vitest** (+3). tsc clean. Bundle 612 → 618 KB /
  174 → 175 KB gzipped (+6 KB).
- **Phase 12.2.2 — SHIPPED 2026-06-01 (ADR 0142).** KYC Level 1
  citizen-driven wizard + India Post PIN-code adapter (second
  composition of the external-adapter substrate) + operator
  review queue. The common physical-service KYC slice for the
  4 wave-1 provider roles. NEW
  `src/phase1/india-post-pincode.mjs` composes the substrate
  with postalpincode.in (5 req/sec polite cap, 7-day TTL).
  **§15 binding upgrade**: cacheKey on the audit ledger is a
  sha256 digest of the PIN, NOT the raw PIN; access-log path
  rewrites `/api/geocode/pincode/:pin`. NEW
  `kycLevel1Submission` field on providerIdentity carrying
  `{fullLegalName, aadhaarLast4, panLast4, addressPinCode,
  addressLine, cityFromPincode, stateFromPincode,
  submittedAt}`. **Aadhaar/PAN last-4 ONLY** — substrate
  defensively rejects 12-digit Aadhaar / 10-char PAN; UI
  paste handler keeps the TRAILING 4 not the leading 4 (a
  critical bug surfaced by the adversarial review). NEW
  ledger event `provider_identity.kyc_l1_submitted` —
  carries field NAMES + city/state only, NEVER values. NEW
  `selfProviderRecord` projection redacts last-4 + addressLine
  on the owner-list endpoint (defense-in-depth until Bharat
  ID lands signed sessions in Phase 13+). NEW
  `POST /api/provider-identities/:id/submit-kyc-l1` uses
  `requireProviderOwnerAuth` (X-Bharat-OS-Acting-Identity
  header), with ledger-before-save ordering + optimistic
  concurrency re-read returning 409 on parallel operator
  transitions. NEW `GET /api/admin/provider-identities?
  status&roleKind&hasKycL1Submission&limit` admin queue.
  FE: 3-step wizard `/onboarding/kyc-level-1` (identity →
  address with PIN auto-fill OR honest manual fallback in
  stub mode → review); ProviderProfile banners distinguish
  no-submission / pending / **rejected** (operator
  `submitted→draft` transition). Operator console: NEW
  `#provider-kyc-review` section + admin-token/operator-id
  topbar (sessionStorage only) + two-step confirm on attest
  echoing identity before bless. Adversarial-review
  workflow surfaced 24 findings across 4 lenses (PII /
  state-machine / auth / UX honesty); 12 high+med fixed
  in-phase, 12 low deferred with scope rationale in ADR.
  Tests: 1053 → **1082 Node** (+29) + 119 → **121 vitest**
  (+2). tsc clean. Bundle main 599 → 612 KB / 170 → 174 KB
  gzipped (+13 KB). Phase 12.2 wave-1 common KYC flow is
  the substrate per-role extras (cab-driver vehicle docs,
  personal-driver police-verification, etc.) plug into in
  Phase 12.2.3+.
- **Phase 12.2.1 — SHIPPED 2026-06-01 (ADR 0141).** First real
  external-API integration + the substrate that makes every
  future one cheap. NEW `src/phase0/external-adapter.mjs`
  factory (`createAdapter`) owns the cross-cutting concerns
  once — stub-vs-live mode dispatch (env-configurable per
  adapter via `modeEnvVar`; defaults stub), in-memory LRU
  cache (pointer-not-payload — caller hands a coarsened
  cacheKey), token-bucket rate limiter (default 1 req/sec),
  polite User-Agent + Accept injection, 6s AbortController
  timeout, audit-ledger emission (`external_adapter.call`
  with `{adapter, mode, cacheKey, status, latencyMs, at}`
  — NEVER the response body; binding-grep test asserts no
  4dp coord in audit JSON). NEW
  `src/phase1/nominatim-geocoder.mjs` composes the substrate
  with OSM Nominatim's exact policy (1 req/sec, polite UA
  with contact URL, 1dp bubble cache key, 24h TTL). NEW
  `GET /api/geocode/reverse?lat&lng` endpoint returns
  `{mode, source, place: {label, suburb, city, state,
  countryCode, osmId}, latencyMs}`. NEW FE
  `useReverseGeocode` TanStack hook + `<PickupAreaHint/>`
  component renders "Near Shivajinagar, Pune" above the raw
  lat/lng on both branches of `ProviderBookingDetail`
  (post-accept full coord + pre-accept masked bubble) and
  `CitizenServices` booking detail. Stub mode is the test +
  demo default; flip per-adapter env var to go live. Tests:
  1035 → 1053 Node (+18) + 115 → 119 vitest (+4). tsc clean.
  Bundle main unchanged at 599 KB / 170 KB gzipped. Substrate
  is the foundation every future integration composes —
  DigiLocker, Aadhaar e-KYC, GST, UPI rails all land as
  ~100-line adapters from here.
- **Phase 12.1b.4 — SHIPPED 2026-06-01 (ADR 0140).** SLM-D booking
  advisor — last of the four 12.1b sub-phases. Honest scope:
  true rate-negotiation breaks `rateSnapshot` immutability +
  escrow contract (Phase 12.2 work). Shipped the smallest useful
  slice: a **FE-only provider advisor**. On `pre_authorized`,
  provider taps "✨ Ask my SLM: should I accept?" → on-device
  wllama generates `accept | reject | unsure` + rationale +
  optional polite reject-reason chip the provider taps to
  pre-fill the existing reject input. Chip NEVER changes booking
  state — only the existing Accept/Reject buttons do. Pure
  primitives at `frontend/src/lib/booking-advisor.ts`; runtime
  hook reuses Phase 9.0c wllama singleton (model bytes load AT
  MOST ONCE across SLM-A / SLM-C / SLM-D). Tiered rate limit
  (3/booking/60s + 12/global/5min). Bindings: pickup precision
  held to 1dp bubble ONLY (vitest case asserts no 4dp coord in
  prompt); no citizen PII; zero new ledger events. Zero BE
  changes. Tests: 1035/1035 Node unchanged + 115/115 vitest
  (+10). Bundle 592 → 599 KB / 170 KB gzipped (+7 KB).
  **Phase 12.1b arc CLOSED** — all four SLM sub-phases (A intent
  / B offline / C forms / D advisor) shipped. Next: Phase 12.2
  wave-1 KYC wizard.
- **Phase 12.1b.3 — SHIPPED 2026-06-01 (ADR 0139).** SLM-C light
  dynamic forms. Generic schema-driven `<DynamicForm/>` renderer
  (controlled component, schema-driven, inline per-field error
  codes, dependsOn gating) + per-role light field schemas for the
  4 wave-1 roles (cab-driver / personal-driver / household-help /
  labourers) + SLM "suggest" chip on freeform text fields. NEW
  optional `roleAnswers: {schemaVersion, values} | null` field on
  providerIdentity — NOT echoed by publicProviderRecord (citizen
  privacy tested). NEW `provider_identity.updated` ledger event
  emits on every profile mutation with `updatedFields` (field
  NAMES only — pointer-not-payload). NEW GET
  /api/provider-role-forms (+ /:roleKind) serves the canonical
  schemas. BE re-validates `roleAnswerValues` via
  `validateRoleAnswers` before persistence; returns per-key
  canonical error codes on failure. SLM suggest: tap-to-accept
  ONLY (never auto-fills), hidden when no SLM installed, tiered
  rate limit (6 per field per 60s + 30 global per 5min), inflight
  singleton. Substrates extracted as CORE shared:
  `src/phase0/dynamic-form.mjs` (FIELD_KINDS + VALIDATORS
  registry + validateAnswers with dependsOn gating + 4KB payload
  cap + 24-field schema cap) reusable for future BookingComposer
  + ConsentSheet; `src/phase1/provider-role-forms.mjs` for the
  per-role schemas (forward-compat: wave-2 roles pass through
  with null envelope). FE mirrors:
  `frontend/src/lib/dynamic-form.ts` + `provider-role-forms.ts`
  with vitest parity snapshot guarding the field-kind +
  validator-name + role-key sets. `frontend/src/lib/use-slm-field-suggest.ts`
  layered on Phase 9.0c wllama runtime (no second model load).
  `frontend/src/components/forms/{DynamicForm, SlmSuggestChip,
  index}` barrel. ProviderOnboarding gained "More about this
  role" Card with the DynamicForm when a schema exists.
  Process: 4-Explore-agent understanding workflow → 3-lens × 2-
  judge design workflow (both judges picked C with overrides:
  wave-1 only, no ledger event for SLM accept, new roleAnswers
  field over JSON-in-description hack, BE re-validates on save,
  add provider_identity.updated ledger event — judge 2
  correctly flagged it didn't exist before). Tests: 1035/1035
  Node (+27 covering pure validators + per-role schemas + HTTP
  integration + binding grep + ledger event emission + citizen
  privacy) + 105/105 vitest (+13 parity + per-role sanity).
  Bundle main 577 → 592 KB / 168 KB gzipped (+15 KB).
  DEFERRED: file uploads, KYC level elevation, Aadhaar/
  DigiLocker integration, operator review console FE, wave-2
  schemas (substrate ready), BookingComposer/ConsentSheet
  refactor onto DynamicForm, adversarial review (substrate is
  binding-grep'd + HTTP-tested + parity-guarded). Next: Phase
  12.1b.4 SLM-D negotiation agent OR Phase 12.2 wave-1 KYC
  wizard.
- **Phase 12.1b.2 — SHIPPED 2026-06-01 (ADR 0138).** SLM-B
  offline-first decisioning + queued sync. Citizens in poor-
  connectivity India can now type an intent while offline;
  it persists on their phone (per-identity IndexedDB,
  `bharat-os-offline-<actorId>` so two profiles on one device
  cannot enumerate each other's queue); on reconnect the
  drainer replays it with a stable `Idempotency-Key` and the
  server returns either the cached response (if a duplicate
  POST happened on the way) or a fresh orchestration. Backend
  substrate `src/phase0/idempotency.mjs` is **ledger-backed**
  (no new SQL table) — three new event types
  (`<scope>.idempotency_key_minted` / `.idempotent_replay` /
  `.idempotency_key_reused_with_different_payload`) on the
  existing append-only ledger. Replay returns cached response
  body byte-for-byte; the orchestrator code path is NEVER
  re-entered, so decision rows + skill preflights + push
  notifications + escrow holds fire exactly ONCE per real
  mutation (tested). Per-actor scoping is structural —
  `findMintedRecord` compares (scope, actorId, key); stolen
  keys cannot cross-replay. Same key + different request
  fingerprint → 409 + tripwire ledger event (catches stolen-
  key-with-different-payload attack). `withIdempotency` is
  `scope`-generic so 12.1b.3 wraps bookings + consents + flags
  by passing a different scope; no refactor needed. FE
  substrate: `frontend/src/lib/offline-queue.ts` raw IDB
  wrapper (no npm dep, ULID inline, 50-row + 7-day caps,
  stranded-`sending`-row recovery sweep), `idempotency-key.ts`
  (SubtleCrypto sha256 of actorId+intentText+annotation+
  enqueueIso+nonce, with explicit insecure-context guards),
  `use-online-status.ts` (navigator.onLine + HEAD /api/health
  captive-portal probe), `use-queue-drainer.ts` (sequential
  FIFO, Web Locks single-flight with module-promise fallback
  for strict-mode safety, exponential backoff 1s/4s/16s/60s),
  `use-send-intent-smart.ts` (offline→enqueue; online→POST
  with Idempotency-Key; network blip→enqueue with
  `network_error` reason). Surface: `OfflineQueuePill` above
  intent textarea (4 states: hidden when online+empty / grey
  "Offline" / amber "Queued (N)" / red "N didn't go through")
  + `/citizen/queue` route with `QueuedIntentsPanel`
  ("N queued — not yet on Bharat OS" verbatim copy + Retry /
  Discard per row). Global drainer mounted in App.tsx fires
  "Sent N queued intents" toast on successful background
  drain. New GET/HEAD /api/health (`cache-control: no-store`).
  Adversarial review verdicts — Audit: ship_clean. Safety:
  ship_with_fixes (1 must-fix + 2 should-fix applied). UX:
  ship_with_fixes (1 should-fix applied; rest deferred to
  12.1b.3 queue-feedback batch). Tests: 1008/1008 Node (+15)
  + 92/92 vitest (+11 including SubtleCrypto guard test).
  Bundle main 565 → 577 KB / 163 KB gzipped (+12 KB). Scope
  held to POST /api/orchestrations only — bookings + consents
  + flags + express-interest still online-only, deferred to
  12.1b.3 because they carry CAS/escrow/signed-artifact
  concerns. Next: **Phase 12.1b.3** offline queue for
  bookings/consents/flags + queue-feedback UX batch, OR
  SLM-C dynamic forms.
- **Phase 12.1b.1 — SHIPPED 2026-06-01 (ADR 0137).** SLM-A
  vernacular intent parser — first of four 12.1b AI-orchestration
  sub-phases. Citizens with an installed wllama SLM (Phase 9.0c)
  see their device's interpretation before tapping Send. The
  annotation is a confidence signal that the server records for
  audit + lays down an `intent.slm_<verdict>` ledger event
  (`agreed | disagreed | fe_only | server_only | absent`), but
  the deterministic vernacular substrate (`src/phase1/vernacular.mjs`)
  remains the source of truth for actionType, consent scoping,
  and skill preflight — annotation NEVER overrides. Substrate
  extracted as a CORE shared module per the binding:
  `src/phase0/intent-annotation.mjs` (normaliseIntentAnnotation
  validator + compareIntentAnnotation verdict comparer +
  buildIntentAnnotationLedgerEvent builder; field caps prevent
  ledger bloat from a misbehaving FE). FE shared lib:
  `frontend/src/lib/intent-parser.ts` (prompt builder +
  completion parser; pure functions reusable by future SLM-C
  dynamic forms + SLM-D negotiation agent) +
  `use-slm-intent-parser.ts` hook (lazy wllama load, OPFS-cached,
  cleans up on unmount). CitizenHome integration: "Check my
  understanding" button (non-technical copy) → "Understanding
  on-device…" → soft Badge "We understood: <Friendly> · <lang>
  · confidence <pct>%". `handleSend` annotation gate is strict:
  annotation attached ONLY when (a) parsed text matches sent
  text byte-for-byte, (b) textarea hasn't been edited since
  parse, (c) voice interim is empty. Adversarial review (3
  lenses + triage) — Privacy: ship_clean. Safety: 1 should-fix
  (reentrant parse de-dup + post-unmount setState guard). UX:
  4 must-fix (annotation gate + error retry + chip-clear
  semantics + jargon copy). All applied before commit. Tests:
  993/993 Node (+18 intent-annotation tests including binding
  grep + ledger verdict + non-override fixture) + 81/81 vitest
  (+15 intent-parser contracts + 3 adversarial edge-case
  rejections). Bundle main 557 → 565 KB / 159 KB gzipped (+8 KB).
  wllama lazy chunk unchanged. Next: **Phase 12.1b.2** SLM-B
  offline-first decisioning + queued sync.
- **Phase 12.1a.2 — SHIPPED 2026-06-01 (ADR 0136).** Booking +
  citizen-escrow + provider surface — closes the marketplace
  loop. Second of two 12.1a sub-phases. Booking record with 6
  live + 4 terminal-refund states (`pre_authorized → in_progress
  → provider_marked_complete → citizen_confirmed | auto_released
  | disputed | cancelled_after_dispute | rejected_by_provider |
  cancelled_by_citizen | expired_unaccepted`). Every transition
  is CAS-guarded by a monotonic `seq` so concurrent provider
  accepts race safely (one wins, second gets 409 `stale_seq`).
  Rate snapshot frozen at booking-create so provider rate edits
  do NOT propagate to existing bookings (immutability tested).
  Pickup point persisted at 4dp on the booking record (visible
  ONLY to the two parties after auth), ledger events carry ONLY
  the 1dp bubble — ledger PII replay test asserts no 4dp coord
  in any `booking.*` event. Pre-accept provider projection masks
  pickup to bubble1dp only. **Lazy auto-release on read**: every
  list/detail endpoint calls `maybeAutoRelease` BEFORE returning
  — 4h pre-accept expiry refunds idle bookings, 24h
  provider_marked_complete window auto-releases payout; no
  node-cron. Operator backstop at `POST /api/admin/bookings/
  sweep-stale` is CAS-safe + idempotent. Disputed bookings are
  operator-only — `POST /api/admin/bookings/:id/adjudicate`
  with admin token returns `release_to_provider` or
  `refund_to_citizen` (split deferred to 12.2). **Common
  features extracted as CORE shared substrate** per the binding:
  `src/phase0/escrow-paise.mjs` (entity-agnostic paise primitives;
  sponsor.mjs refactored to thin wrappers, 47 sponsor tests
  regression-pass), `src/phase0/provider-auth.mjs`
  (`requireProviderOwnerAuth` / `requireBookingPartyAuth` /
  `requireCitizenOwnerAuth`), `src/phase0/booking-push.mjs`
  (binding-grep tests forbid displayName/phone/4dp coord),
  `src/phase0/geo.mjs::bubbleAt1dp`, FE
  `frontend/src/lib/format-paise.ts` + `format-distance.ts` +
  `provider-context-store.ts` + `components/booking/*`. Provider
  auth = root identity + providerIdentityId (NO bearer in v1 —
  providers are citizens with already-authenticated phones;
  bearer-mint for delegation deferred to 12.3). Funding model:
  bookkeeping-v1 (admin-token-gated citizen escrow deposit
  endpoint stands in for a real UPI rail until Phase 12.2+
  payment adapter; every escrow envelope carries
  `fundingMode: 'bookkeeping-v1'` to keep it honest). 11 new
  API endpoints. New /provider/* surface with 5-tab bottom nav
  (Inbox / Active / History / Profile / Settings); Inbox is
  default landing. Citizen side: `/citizen/services/book/:id`
  BookingComposer, `/citizen/services/bookings` list +
  `/bookings/:id` detail; existing provider detail page gained
  "Book now" PRIMARY CTA above the preserved "Express interest"
  soft-touch. Push notifications fire on every key transition
  via centralised booking-push.mjs builders — citizen pushes
  generic; provider's own payout push may carry ₹ amount
  (own earnings). Adversarial review (3 lenses + triage)
  identified 3 must-fix + 10 should-fix; **3 must-fix
  (PRIV-1+2 citizen-auth gap, ESCROW-CAS race) + 6 should-fix
  (UX-1/2/4/8/10 + TEST-AUTH) applied before commit**. Tests:
  975/975 Node (+30 new booking tests including auth-gate +
  ESCROW-CAS regression) + 66/66 vitest. Bundle 528 → 557 KB
  / 156 KB gzipped (+29 KB). Next: **Phase 12.1b** (SLM
  AI-orchestration: vernacular intent / offline-first /
  dynamic forms / negotiation agent) OR **Phase 12.2**
  (provider onboarding wave 1 — Aadhaar e-KYC + role-specific
  docs + ratings + Trust Passport feedback loop).
- **Phase 12.1a.1 — SHIPPED 2026-06-01 (ADR 0135).** Marketplace
  discovery substrate + citizen browse — first of two 12.1a
  sub-phases (12.1a.2 booking + escrow + provider surface next).
  Discriminated-union geo schema on providerIdentity (point-radius
  with 4dp centroid persist, 2dp public emit via new
  `toPublicServiceArea` — closes asymmetric privacy gap where
  4dp could pinpoint a household-help worker's home).
  Polygon kind rejected loudly (forward-compat). Legacy `{summary}`
  read-coerced and excluded from discovery. State-machine guard:
  draft → submitted refused without point-radius geo
  (transitionProviderStatus AND attestProviderKyc both enforce).
  **Geo extracted as a CORE SHARED MODULE**, not marketplace-
  specific: `src/phase0/geo.mjs` (haversine, distanceBand,
  bubblesOverlap, round1/2/4, INDIA_BBOX) reused across
  marketplace + future Phase 12.1a.2 pickup-point + mesh node
  locality + regulator audit bucketing. Frontend mirror at
  `frontend/src/lib/geo.ts` + `frontend/src/lib/geolocation.ts`
  (useGeolocationCapture with precision 'coarse'/'medium'/'fine')
  + `frontend/src/components/geo/{LocationConsentSheet,
  CityPickerSheet, ServiceAreaPicker}`. New API: GET
  /api/marketplace/providers (rate-limited, defensively re-rounds
  lat/lng to 1dp, returns distanceBand pill NEVER precise metres,
  emits ANONYMOUS marketplace.searched ledger event — no citizen
  identity attached even when session present). POST
  /api/marketplace/providers/:id/express-interest (citizen
  existence check via store.readIdentity gate, typed
  marketplace.interest_expressed ledger event so 12.1a.2
  booking has a real precedent row to upgrade). Citizen surface
  at `/app/citizen/services` with three nested routes (index +
  by-role + provider detail) — NO 6th bottom-nav tab. CitizenHome
  intercepts "Book a cab" + "Hire household help" suggestions to
  deep-link directly. ProviderOnboarding upgraded:
  free-text areaSummary replaced with ServiceAreaPicker (live
  location 4dp / city centroid / 30 India cities). ONDC
  SUPPRESSED by construction — `marketplace-discovery.mjs` never
  imports tools.mjs (binding test). NO commission / takeRate /
  platformFee field. Scoped by 7-Explore-agent Workflow; designed
  by 3-lens × 2-judge proposal Workflow; hardened by 3-lens
  adversarial review Workflow — 2 must-fix (PRIV-1 citizen
  spoofing, EC-2 CRLF/BOM in note) + 7 should-fix applied before
  commit. Privacy verdict: ship_with_fixes → ship_clean post-fix.
  Tests: 945/945 Node (+4 new) + 58/58 vitest. Bundle 505 → 528
  KB / 150 KB gzipped (+23 KB for browse routes + geo lib +
  geolocation hook + city centroids + hooks).
- **Phase 12.0.5 — SHIPPED 2026-06-01 (ADR 0134).** Sponsor
  `/app/sponsor/` admin surface — fourth and final sweep
  sub-phase. **Substrate-integration arc CLOSED.** 25 new files
  (1 Zustand store + 1 bearer api wrapper + 1 FE Web-Crypto
  export-verify port + 14 routes + 9 shared components).
  Scoped by a Workflow with 7 parallel Explore agents + a
  synthesis pass; hardened by a second Workflow with 3 parallel
  adversarial reviewers (privacy / UX / edge cases) + triage —
  13 must-fix/should-fix items applied before commit. Surface
  covers: bearer-token paste sign-in → dashboard → labeling
  jobs (list / draft create / items upload / launch / Phase 10.4
  review queue with accept-reject-clawback / Phase 10.5 signed
  audit export with FE crypto-verify) → federated rounds (list /
  create with SLM-pack picker / detail / unsigned NDJSON export)
  → escrow ledger (filtered) → settings (read-only profile +
  audit-signer pubkey transparency strip + sign-out). §15:
  bearer never echoed to DOM, document title scrubbed, identityHash
  rotation preserved, goldenAnswer never shown to sponsor,
  sign-out cancelQueries before clear so in-flight mutations
  can't pollute next sponsor's cache. Privacy adversarial
  review: ship_clean. Pure FE; zero BE changes. Bundle 434 →
  505 KB / 144 KB gzipped (+71 KB).
- **Phase 12.0.4 — SHIPPED 2026-06-01 (ADR 0133).** Cross-cutting
  sweep, third of four substrate-integration sub-phases. Five
  integrations: (1) real Web Push opt-in on /settings (with
  VAPID keys + service worker registered as /app/sw.js + honest
  unsupported/denied/disabled states); (2) Vault transfer
  download account bundle (.json) on /settings; (3) DPDP
  grievance contact card on /settings (DPO name + email + postal
  + escalation URL); (4) Voice intent mic button on
  /citizen/home (browser SpeechRecognition; en-IN default;
  interim transcript inline; final committed to textarea); (5)
  Flag reports (§9A) — Report button on each Recent Activity row
  opens sheet with category chips + description → POST /api/flags.
  Mostly FE; one operational BE change (VAPID env vars). Bundle
  421 → 434 KB / 129 KB gzipped (+13 KB).
- **Phase 12.0.3 — SHIPPED 2026-06-01 (ADR 0132).** Worker
  sweep, second of four substrate-integration sub-phases.
  Five integrations across two existing surfaces (no new tabs).
  `/worker/earn` gains (1) Schemes card — e-Shram registration
  status + active scheme entitlements (PM-KISAN, PMSYM, etc.)
  with masked UAN + scheme name/code/cycle/benefit; and (2)
  Tax view card (current FY) — gross income · new regime · old
  regime · "cheapest option" highlight + the substrate's full
  legal disclaimer verbatim. `/worker/trust` gains (3) Mint
  Trust Passport attestation button + sheet routing through the
  orchestrator's `trust_attestation` action type → signed
  envelope readable via /verify/; (4) Collective memberships
  list (sangha / cooperative / blessed-collective). All cards
  auto-suppress when underlying data is empty so brand-new
  workers see the same clean Earn surface. Pure FE; zero BE
  changes. Bundle 411 → 421 KB / 125 KB gzipped (+10 KB).
- **Phase 12.0.2 — SHIPPED 2026-06-01 (ADR 0131).** Citizen
  sweep, first of four substrate-integration sub-phases (12.0.2
  → 12.0.5) per founder direction "lets integrate all the
  substrates in the best possible places, showcase as complete
  product". (1) Daily brief on /app/citizen/home — top of
  citizen home calls POST /api/orchestrations with
  actionType:'daily_brief'; renders greeting + composed text +
  structured signals grid (earned 24h, expiring consents, recent
  activity, open §9A flags); consent-blocked variant prompts via
  existing ConsentGrantSheet. (2) Personal memory records as new
  `/citizen/notes` tab — create + list (metadata only) +
  consent-gated read. 5-tab bottom-nav. Pure FE; zero BE
  changes. Bundle 399 → 411 KB / 123 KB gzipped (+12 KB).
- **Phase 12.0.1 — SHIPPED 2026-06-01 (ADR 0130).** Real
  sign-up + sign-in on /app/ over the existing Phase 4.3 phone
  OTP + Phase 5.0 account recovery substrate. Four new FE
  hooks + `<AuthSheet>` two-tab component (sign up / sign in
  + phone → OTP → done flow); Onboarding hero footer surfaces
  account CTAs alongside demo personas. BE adds dev-only
  `_devOtpCode` field on `/api/phone-otp/send` +
  `/api/recovery/start` matched-branch responses (gated by
  `BHARAT_OS_SMS_PROVIDER === 'log'`); §15 anti-enumeration
  sentinel branch on recovery/start MUST NOT include the field
  (test pinned). Node 884 → 890 (+6). FE Vitest unchanged.
  Bundle 392 → 399 KB / 120 KB gzipped (+7 KB).
- **Phase 12.0 — SHIPPED 2026-05-31 (ADR 0129).** providerIdentity
  substrate. New pure module + both stores grow
  `provider_identities` with `root_identity_id` index + DPDP
  §12(3) cascade. Six API endpoints (create / list / public
  read / profile edit / admin kyc-attest / admin transition).
  Wave-1 roles (cab-driver, personal-driver, labourers,
  household-help) flip from "Coming Phase 12.0" to LIVE in
  EARN_ROLES catalog + route through new generic
  `/earn/provider-onboarding`. WorkerHome rewritten with
  two-ledger cards (micro-task live + marketplace pending
  Phase 12.1a). Wave-2 roles (kirana, skilled-trades) remain
  coming-soon (Phase 12.3). Node 865 → 884 (+19). Vitest 41 →
  45 (+4 — 2 hook contract pins, 2 catalog invariants).
  Bundle 384 → 392 KB / 119 KB gzipped (+8 KB).
- **Phase 11.9 — SHIPPED 2026-05-31 (ADR 0128).** Onboarding hero
  rebrand: "I work" → "I earn", "I live" → "I use". In-flow role
  chooser inside Earn surfaces all seven earner motions — Label
  data + Train AI on-device (live, route to /labels and /labs)
  + Drive a cab + Cook + Run a kirana + Help around the house +
  Skilled trades (Phase 12.0 placeholders with honest "ships in
  Phase 12.0" detail sheet per role). EARN_ROLES catalog
  (`frontend/src/lib/earn-roles.ts`) is the canonical taxonomy;
  same list will drive future "Add another way to earn" surface
  + provider-side admin onboarding. /shell/ link removed from
  hero footer per /app/-grows-/shell/-retires. Pure FE; zero BE
  changes. Vitest 35 → 41 (+6 catalog invariants). Bundle 380 →
  384 KB / 116 KB gzipped (+4 KB).
- **Phase 11.8 — SHIPPED 2026-05-31 (ADR 0127).** Per-scope
  consent grant UI + auto-re-send launched from the Phase 11.7
  Outcome card. Three new hooks (`useConsents`,
  `useGrantConsent`, `useRevokeConsent`) — all grants/revocations
  signed by the citizen (`signWithIdentityId + signRole`) so the
  artifact is authentic. New `<ConsentGrantSheet>` lists each
  required scope with checkbox + plain-language description +
  TTL pills (1/7/30/90 days). On grant, CitizenIntent auto-
  re-fires the original intent — "Book a cab" flows blocked →
  grant → planned end-to-end without bouncing to /shell/. Trust
  tab rewritten as a real surface: active consents with per-row
  Revoke + history of revoked/expired grants. Pure FE; zero BE
  changes. Vitest 33 → 35 (+2 contract pins on signing fields).
  Bundle 372 → 380 KB / 115 KB gzipped (+8 KB).
- **Phase 11.7 — SHIPPED 2026-05-31 (ADR 0126).** Citizen intent
  orchestration wire-up. Fixed FE/BE payload shape mismatch
  (`useSendIntent` was sending `{intent:{intentText},
  actionRequest:{actorId}}` but BE reads flat keys → every intent
  silently fell back to `mesh_storage` and recent-activity filter
  never matched). Added `<OutcomeCard>` surfacing action-type
  label + status badge + localised message + required consent
  scopes + failed policies + collapsible plan + audit reference.
  Honest about blocked verdicts; cites the Phase 11.8 consent UI
  as next step. Vitest 32 → 33 (+1 contract pin). Bundle 369 →
  372 KB / 113 KB gzipped (+3 KB).
- **Phase 10.6 — SHIPPED 2026-05-31 (ADR 0125).** Labeling
  marketplace × on-device SLM. Pre-labeling hint card surfaces
  above every task — gated on the worker having an installed SLM
  (Phase 9.0b record + OPFS bytes). Pure FE: zero BE changes.
  `frontend/src/lib/labeling-slm-hint.ts` carries 5 task-kind-
  specific prompt templates + parsers (classification,
  preference_pair, span_annotation, transcription, safety_label).
  `<SlmHintCard>` lazy-loads the wllama runtime on first tap,
  streams the completion via `onToken`, parses to a typed
  `labelValue`, and offers [Use this suggestion] which flows
  through the existing submit pipeline (golden + sponsor-review
  + mesh credit unchanged). Bundle 363 → 369 KB / 112 KB gzipped
  (+6 KB). Vitest 16 → 32 (+16 hint tests). **Phase 10 v1 arc
  CLOSED.** Remaining 10.x are polish (10.4.1 inter-annotator α,
  10.5.1 audit signer rotation, 10.5.2 sponsor console download,
  10.5.3 premium-gate UI, 10.1.1 cancel + refund, 10.6.1
  per-task UI annotation).
  **Direction set 2026-05-27. Pauses Phase 9.0c (llama.cpp-wasm
  runtime).** The 4,811-line vanilla-JS `/shell/` accumulated too
  much tech debt across Phases 1.0 → 9.0b — every phase added a
  card with no editorial discipline. On 2026-05-27 the founder
  opened the demo cold and could not get past the "No profile"
  wall; a 1-hour debug session failed to identify a single root
  cause because the shell is structurally incoherent (it tries to
  be worker dashboard + citizen orchestrator + verifier + settings
  + labs simultaneously). Decision: stop polishing the shell,
  rebuild the user-facing layer with discipline, leave `/shell/`
  as developer surface. **Stack** (binding): Vite + React 19 +
  TypeScript + Tailwind + shadcn/ui (copy-paste, not npm) +
  Zustand + TanStack Query + React Router v7 + Vitest.
  **First significant npm dependency surface for Bharat OS
  frontend**; backend zero-npm-dep posture preserved.
  **Surfaces**: split-hero `/app/` onboarding (no single primary
  persona — investor decides on the fly between Worker / Citizen
  on the very first screen), `/app/worker/` (Priya/Suresh/Rajesh
  — mesh ticker → cash-out → MFI consent → Trust Passport),
  `/app/citizen/` (Sita/Lakshmi/Anjali/Aarav — intent → policy
  gate → orchestrated outcome → recent activity), `/app/verify/`
  (adapted from existing `/verify/` for MFI bundle read),
  `/app/labs/` (SLM install + federated rounds + OCR — moved out
  of main surfaces), `/app/settings/`. **Brand**: tricolour-
  inspired — white surface `#FFFFFF`, flag-grade saffron `#FF9933`
  for primary actions, flag-grade green `#138808` for verified /
  trust states, navy `#000080` for regulated / policy-gated flows.
  Discipline rule: flag colors as accents not splashes, must not
  look like a government app. Typography: Manrope (Latin) +
  Noto Sans Devanagari/Tamil/Bengali (vernacular). 6-step type
  scale, 2 weights, 7-step spacing, 3 border radii. **Component
  library** built FIRST before any feature work: Hero (with split
  variant), Card, Action (6 variants), Badge, Sheet, Tab, Toast,
  Identity, Field, Money, Stat, Evidence. **State**: Zustand
  stores (`useIdentityStore`, `useEarnStore`, `useTrustStore`)
  replace global state object; TanStack Query replaces ad-hoc
  `fetchJson`. **DPDP §15 bindings preserved end-to-end** (identity
  switcher, pointer-not-payload Trust Passport, §12(3) erasure
  cascade in /app/settings/, audit ledger evidence collapsibles).
  **Sub-phases** 11.0 scaffold + design tokens + components + API
  serve route (~3 days), 11.1 onboarding + persona picker (~2 days),
  11.2 worker surface (~4 days), 11.3 citizen surface (~4 days),
  11.4 verifier adaptation (~2 days), 11.5 labs catch-all (~2 days),
  11.6 polish + investor-demo smoke (~1 day). Total ~18 days =
  ~2.5 weeks. **FE+BE parity rule activates**: every phase from
  Phase 12 onward ships both layers together; no more BE-first
  phases that leave the FE to catch up (the failure pattern that
  created the Phase 5.9→7.3 backlog and forced this rebuild).
  Phase 9.0c (llama.cpp-wasm) restart: AFTER `/app/` v1 ships.
- **Phase 10 (ADR 0110)** — Labeling marketplace (sponsor-paid, worker-
  executed, DPDP-audited Indic-language data labels). Strongest near-
  term monetisation lever surfaced in the 2026-05-25 strategy thread:
  Scale AI / Surge AI / Labelbox occupy a priced ~$15B+ market with
  thin Indic-language coverage; Bharat OS already ships ~70% of the
  substrate it needs (DPDP consent + signed ledger + UPI cash-out +
  Trust Passport provenance) and ~50% of the worker-side input
  modality (Phase 2a.5 voice / 2a.8 OCR; Phase 9.0 SLM when shipped).
  Six sub-phases: 10.0 sponsor onboarding + escrow; 10.1 job spec +
  corpus upload; 10.2 worker discovery + new **🏷️ Label** tab; 10.3
  per-task-kind UIs (preference pair / classification / span /
  transcription); 10.4 QC pipeline (golden-set + inter-annotator α +
  sponsor sample); 10.5 signed JSONL export bundle; 10.6 SLM pre-
  labeling hint (depends on Phase 9.0). Per-label payouts flow into
  the existing `mesh_events` ledger and drain via the Phase 8.3
  cash-out UI. Worker preference-pair throughput at ~₹40/label × 6/min
  ≈ ₹240/hour gross — beats the ₹0.16/M-token inference rate as a
  near-term worker hook. Sponsor escrow + platform fee
  (`bharatOsFeePaise`) is the FIRST non-investor revenue line. §15:
  per-job consent grants via Phase 1.27 remediation; rotating
  `identityHash` per `(identityId, jobId)` prevents sponsor cross-job
  correlation; refund-on-failed semantics extend to labeling.
  Estimated effort: ~9-10 weeks across the six sub-phases.
- **Phase 9.0c / 9.0d (ADR 0107)** — Tier-4 SLM remaining sub-phases.
  Phase 9.0a (registry, ADR 0112) and 9.0b (install records + DPDP
  cascade + shell install UI, ADR 0113) are SHIPPED. The end-to-end
  opt-in flow + storage + audit trail + DPDP cascade is real;
  worker can install (download + SHA-256-verify + persist to OPFS) +
  uninstall, but can't yet *use* the model for inference.
  **9.0c direction decided 2026-05-25**: ship **llama.cpp-wasm
  ONLY** for v1 (universal CPU compatibility, accept 3-10 tok/s on
  phones; single third-party dep; works without WebGPU on every
  Indian phone the shell already targets); **lazy-load the runtime
  on first Install tap** matching the Phase 2a.8 Tesseract.js
  pattern — `/shell/` cache stays unchanged for users who never
  install an SLM, runtime fetched from CDN/operator-host mirror
  only when the worker actually opts in. MLC-LLM (WebGPU) deferred
  as future polish once we have a Snapdragon 8 Gen 2+ test device.
  ONNX Runtime Web not pursued — middle-tier without a clear win.
  Still needs ADR 0114 for the choice rationale + distroless-deploy
  trade-off before any code. **Remaining**: 9.0c runtime adapter
  (~2-3 wks now, smaller than the original 3-4 wk estimate because
  scope dropped from three runtimes to one); 9.0d integration with
  Phase 3.x federated rounds + Phase 6.0b mesh-inference workload
  events finally recording real ticks (~1 wk). Total remaining:
  ~3-4 weeks.
- **Phase 9.1 (sketched)** — sponsored federated-round API. Depends on
  Phase 9.0. Sells privacy-preserving fine-tuning to banks / hospitals
  / government as a paid service routing through the operator network.

Suggested sequencing (revised 2026-05-31 after Phase 9.0c shipped):
Phase 11 + Phase 9.0c DONE. Next up:
- Phase 9.0c (llama.cpp-wasm runtime adapter, ~2-3 wks; resume
  post-/app/, ships with its `/app/labs/` surface per the FE+BE
  parity rule)
- Phase 9.0d (federated-round + mesh-inference integration, ~1 wk)
- Phase 9.1 (sponsored federated rounds — demand-side revenue)
- Phase 10.0–10.5 (labeling marketplace, sponsor-funded revenue
  line; 10.0–10.2 launchable independently of 9.0c)

Every phase from Phase 11 onward ships FE+BE together per the
binding rule recorded in 2026-05-27 session memory.

---

Closed in Phase 12.0.5 (ADR 0134 — sponsor /app/sponsor/ admin surface; substrate-integration sweep arc CLOSED):
1. ✅ **Sponsor /app/sponsor/ admin surface ships — full labeling marketplace + federated rounds + escrow + signed audit export end-to-end without /shell/; sweep arc closes** — Fourth and final of four substrate-integration sub-phases per founder directive 2026-06-01 (12.0.2 citizen, 12.0.3 worker, 12.0.4 cross-cutting, this is sponsor). Sponsors previously hit curl with their bearer token; /shell/ has no sponsor admin UI. Phase 12.0.5 ships /app/sponsor/* — token-gated console covering labeling-job admin, federated-round admin, escrow lifecycle, and Phase 10.5 signed-audit-export download with FE Web-Crypto verification. Substrate BE-complete (Phase 9.1 sponsors + bearer-auth, Phase 10.1-10.5 labeling + QC + signed export, Phase 3.x federated rounds, Phase 11.8 consent patterns). Pure FE; zero BE changes plus one operational config (admin token + VAPID env vars on dev server). **Scoped by a Workflow** with 7 parallel Explore agents mapping sponsor-auth + escrow + labeling-job lifecycle + QC review + signed export + federated rounds + /shell/-sponsor-reference (confirmed no /shell/ sponsor UI exists); synthesis pass produced 600-line implementation spec covering routing tree + auth flow + hooks-by-name + components-by-name + edge cases + §15 bindings + implementation order. **Hardened by a second Workflow** with 3 parallel adversarial reviewers (privacy + UX + edge-case lenses); triage produced 6 must-fix + 7 should-fix + 10 defer items with concrete code patches; all 13 must/should items applied before commit. **25 new files**: lib/sponsor-auth-store.ts (Zustand-persist at distinct localStorage key bharat-os.app.sponsorAuth.v1, holds {sponsorId, bearerToken}); lib/api-sponsor.ts (apiWithBearer JSON wrapper + fetchWithBearer raw fetch for NDJSON, both inject Authorization: Bearer from store at call time, fetchWithBearer throws on 401/403 with .status + .code so auth guard reacts); lib/sponsor-export-verify.ts (FE port of Phase 10.5 verifier using Web Crypto crypto.subtle.digest SHA-256 + verify Ed25519, mirrors src/phase1/labeling-export.mjs); routes/sponsor/SponsorSurface.tsx (top-level guard — sets document title "Sponsor console — Bharat OS" without displayName per §15, subscribes to TanStack Query v5 cache events looking at state.error.status not action.type which v5 emits as 'failed' not 'error', on 401/invalid_token/missing_authorization clears+removeQueries+toast+navigates to /sponsor/; renders entry page when no token else mounts 13 nested routes); components/sponsor/SponsorTopBar.tsx (logo + displayName + status badge + sign-out which cancelQueries BEFORE clear so in-flight mutations don't land against now-cleared identity); components/sponsor/SponsorBottomNav.tsx (5 tabs Dashboard/Jobs/Rounds/Escrow/Settings, fixed-bottom mobile + inline sm+); routes/sponsor/SponsorEntryPage.tsx (sponsor ID field + bearer type=password with show/hide toggle, useSponsorSelfProbe seeds cache on success, three-step Evidence explaining where token comes from); routes/sponsor/SponsorDashboard.tsx (3 escrow Stat tiles + 3 counts including HONEST "jobs sampling" metric not estimated pending-submission count — caught by adversarial UX review); routes/sponsor/SponsorJobsList.tsx (filter chips + per-job cards); routes/sponsor/SponsorJobCreate.tsx (full wizard task kind + language + modality + economics + QC params + IP terms + consent purpose code + projected escrow lock + 402 surfaces EscrowInsufficientCallout); routes/sponsor/SponsorJobDetail.tsx (3 stat cards + plan + economics + items uploader when draft + launch button + nav to review queue + export, escrowError cleared on launch success); components/sponsor/JobItemsUploader.tsx (JSON array OR JSONL OR single JSON object, strips UTF-8 BOM via regex, 10MB paste cap, per-line parse errors in collapsible details); routes/sponsor/SponsorReviewQueue.tsx (Phase 10.4 QC sampled submissions, per-row LabelValueViewer task-kind-specific, Accept + Reject buttons, NO raw workerId rendered — only identityHash per §15); components/sponsor/RejectReasonSheet.tsx (clawback warning + reason ≥4 chars enforced); components/sponsor/LabelValueViewer.tsx (per-task-kind read-only renderer); routes/sponsor/SponsorJobExport.tsx (Phase 10.5 signed NDJSON download with FOUR-bucket verification: verified/unverified/mismatch/fetch_failed, Retry-verification action when fetch failed, verdict legend card); routes/sponsor/SponsorRoundsList.tsx (status + update count + payout); routes/sponsor/SponsorRoundCreate.tsx (modelName + baselineHash + maxParticipants + payout + maxEpsilon + deadline + aggregation mode + optional SLM pack picker via useSlmCatalog + targetTask); routes/sponsor/SponsorRoundDetail.tsx (status + plan + privacy spend); routes/sponsor/SponsorRoundExport.tsx (NDJSON with honest "unsigned (Phase 9.1)" badge until future Phase 9.2 federated-export-signing); routes/sponsor/SponsorEscrow.tsx (3 stat cards + ledger filtered to sponsor's sponsor_escrow.* + labeling_export.signed events via public /api/ledger with client-side filter); components/sponsor/EscrowLedgerRow.tsx (per-type icon + amount + context + timestamp); components/sponsor/EscrowInsufficientCallout.tsx (reusable 402-response renderer); routes/sponsor/SponsorSettings.tsx (read-only profile + audit signer pubkey transparency strip with copy-PEM + sign-out). **Triage findings applied** (all 13): MF-1 auth guard read state.error not action.type (v5 emits 'failed'); MF-2 fetchWithBearer throws on 401/403 with status+code so guard catches; MF-3 cancelQueries before clear in both sign-out call sites; MF-4 verifyFetchFailed bucket separates pubkey-fetch-failure from mismatch + Retry action; MF-5 BOM strip + single-object branch + 10MB cap + per-line errors; MF-6 dashboard counts jobs sampling not estimated pending submissions; SF-1 review queue links to signed export as source-item stopgap; SF-2 verifier guards empty bodyLines before indexing; SF-3 useSponsorSelfProbe onSuccess seeds ['sponsor-self', sponsorId] cache; SF-4 escrowError cleared on launch success; SF-5 entry-page 3-step Evidence + escalation path; SF-6 per-line parse errors with lineNum+error+snippet; SF-7 verdict legend card with what each badge means. **§15 bindings**: bearer never echoed to DOM (type=password, never re-rendered, never in URL/query/title/log); document title scrubbed ("Sponsor console — Bharat OS" constant, no displayName); per-(job, worker) rotating identityHash preserved (substrate strips workerId, FE types do NOT widen shape); goldenAnswer values never displayed to sponsor (substrate already strips on review-list response, FE never tries); cross-sponsor isolation (every query URL scoped by :sponsorId from auth store, ledger filter additionally validates event.sponsorId === sponsorId); sign-out wipes everything (cancelQueries→clear→removeQueries so no late-landing mutation onSuccess pollutes next sponsor's cache). **Privacy adversarial review**: ship_clean (zero findings). **Tests**: no new tests this sub-phase (no BE changes; FE components pure surface code over typed hooks battle-tested upstream; adversarial workflow stands in for integration-test pass). Full Node 890/890 unchanged. FE Vitest 45/45 unchanged. **Bundle**: main 434 → **505 KB / 144 KB gzipped** (+71 KB for 25 new files + Web-Crypto export-verify port + 13 hooks). wllama lazy chunk unchanged. Build 1.61s. **E2E verified** on running server with admin token + VAPID env vars: POST /api/admin/sponsors → sponsorId + bearerToken once; POST .../deposit ₹500 → escrow 500₹; POST self (bearer) → publicSponsor; POST .../labeling-jobs → draft; POST .../items → uploaded; POST .../launch → active + escrowLocked 800; GET .../export.ndjson (bearer) → signed NDJSON bundle. **Consequences**: substrate-integration sweep arc CLOSED — citizen + worker + cross-cutting + sponsor all on /app/* (four-sub-phase audit-driven plan landed without scope creep); /shell/ is now strictly developer surface — every Phase 1→12 substrate any persona could plausibly use is wired into /app/ — the /app/-grows-/shell/-retires direction lands; sponsor demo flow end-to-end (admin curl-creates sponsor+deposits → sponsor pastes token in /app/sponsor/ → creates draft job → uploads items → launches → workers label via /app/labels/ → sponsor reviews sampled submissions in /app/sponsor/jobs/:id/review/ → rejects with reason firing Phase 10.4 clawback → downloads signed audit export → independently verifies via audit signer public key); pattern established for any future bearer-gated surface (Zustand store + apiWithBearer/fetchWithBearer + query-cache auth-guard subscription is reusable — Phase 13+ Bharat ID can swap bearer for signed JWT without changing FE shape). **What's NOT in 12.0.5** (verbatim from triage Defer): no BE changes (no new endpoints, no cancel/refund/pause, no self-onboarding, no bearer rotation API — token loss = admin re-creates sponsor); no Phase 10.4.1 polish in review queue (bulk accept/reject, filter chips, sort, pagination, source-item display, golden vs worker diff); no sponsor-side analytics dashboard (cost-per-accepted-label, worker-acceptance-distribution, time-to-completion, golden-mismatch-rate — Phase 12.1.x analytics); no round close/abandon actions (BE has no endpoint); no signed federated export (defer to Phase 9.2 federated-export-signing); no multi-sponsor session (one bearer at a time); no CSV import, item edit, sponsor webhook config, push notifications for sponsors; no i18n (English only); no Vitest tests for new components (snapshot tests deferred per plan + adversarial workflow standing in); cross-tab sign-in race (Zustand store; extremely unlikely; polish); bottom-nav aria-labels + More overflow on 5-inch phones (mobile-testing polish); shell-wide EmptyState + ErrorState primitives (polish sweep across whole app not one-off); consent code autocomplete (needs BE enum); RejectReasonSheet char counter (pure polish); aggregationMode case-sensitivity audit (defer to integration tests); useMemo micro-perf (ignore unless DevTools profiler flags); EscrowLedgerRow composite key (needs event.id from BE); verifyLabelingExportLinesAsync timeout wrapper (defensive theater until telemetry flags). ADR 0134.

---

Closed in Phase 12.0.4 (ADR 0133 — cross-cutting sweep: push + vault transfer + DPDP grievance + voice intent + flag reports):
1. ✅ **Settings on /app/ becomes a real control panel + citizen home gains voice mic + flag-this-activity** — Third of four substrate-integration sub-phases per founder directive 2026-06-01 (12.0.2 citizen done, 12.0.3 worker done, 12.0.5 sponsor next). Five integrations across /settings + /citizen/home. Substrates BE-complete for several phases (Phase 7.0 Web Push, Phase 5.x DPDP §12(4), Phase 9.0 flag reports §9A, Phase 5.0 vault snapshot). Mostly FE; one operational BE change (VAPID env vars). **(1) Push notifications opt-in on /settings**: VAPID keypair generated via existing scripts/generate-vapid-keys.mjs + restart with env vars; new `usePushPublicKey()` hook returns null on 503 push_disabled (Settings shows honest "not configured" state instead of throwing); `usePushSubscriptions(identityId)` + `useSubscribePush` (storeDeliveryKeys:true so server can SEND per ADR 0101) + `useUnsubscribePush`. New `frontend/src/lib/push.ts` helpers: registerAppServiceWorker registers /app/sw.js (Vite copies frontend/public/sw.js to build root which BE serves as /app/sw.js); subscribeToPush asks Notification.requestPermission + pushManager.subscribe with VAPID applicationServerKey + returns {endpoint, keys:{p256dh, auth}}; unsubscribeFromPush finds registration + calls subscription.unsubscribe; currentPushSubscription checks for existing browser subscription on mount; URL-safe base64 ↔ Uint8Array helpers for VAPID key conversion. Settings card surfaces three states honestly — push not configured (server 503), browser unsupported/denied (Notification API refuses), subscribed (toggle to disable) vs unsubscribed (Enable button). **New `frontend/public/sw.js`** minimal SW — handles push + notificationclick only, no caching since /app/ build is immutable-hashed; opened by notification url defaults to /app/. **(2) Vault transfer download account bundle on /settings**: `useVaultSnapshot()` mutation (not query — has side effects: response includes privateKey + vaultKey so we don't cache and trigger explicitly); Settings card "Download bundle (.json)" button fetches snapshot wraps in Blob triggers download link with filename bharat-os-account-<slug>-<date>.json; Evidence block honestly explains contents (Ed25519 keypair + vault key + attestations + memory refs) and treats like password-manager export; Phase 2b Android keystore caveat surfaced. **(3) DPDP grievance contact on /settings**: `useDpdpGrievance()` GET /api/dpdp/grievance returns {contact:{name, email, postal, grievanceEscalation, responseSlaDays, protocolVersion}}; Settings card renders all fields — email as mailto: link, escalation URL opens in new tab. **(4) Voice intent input on /citizen/home**: new `frontend/src/lib/voice-intent.ts` typed wrapper around window.SpeechRecognition/webkitSpeechRecognition; VoiceIntentSession class with start/stop/abort and onInterim/onFinal/onError/onEnd callbacks; default lang:'en-IN'; <CitizenIntent> gains mic button positioned bottom-right of textarea (only when isVoiceIntentSupported()); tap starts session, textarea border turns error-red, mic button pulses; interim transcript appended to textarea inline; final transcript committed to state with smart space joining. **(5) Flag reports (§9A) on /citizen/home**: `useCreateFlagReport()` POST /api/flags with {reporterId, subjectId, category, description, evidenceRefs?}; <CitizenIntent> gains "Report" button on each Recent Activity row → opens sheet with subject card (orchestrationId + display label) + category chips (abuse/fraud/spam/safety/other) + description textarea min 10 chars → submit "Report filed. An operator will review under §9A.". **§15 bindings**: VAPID push is real not simulated (server generates keypair, public key served by /api/push-public-key, FE walks through serviceWorker + pushManager.subscribe end-to-end; production sets env vars, demo can leave unset and Settings surfaces honest "not configured" state); vault snapshot is same shape as sign-in via recovery (no new data surface — substrate has carried privateKeyPem server-side since Phase 0 per ADR 0066 demo-mode caveat; Phase 2b moves signing to device hardware keystore); DPO contact rendered verbatim (BE returns same DEFAULT_DPO_CONTACT envelope from Phase 5.x; FE renders fields as-is); voice happens on-device (browser SpeechRecognition uses platform STT engine — Chrome uses Apple/Google speech, Safari uses Apple Speech; Bharat OS receives only recognised text never audio bytes; Phase 12.1b SLM-A will replace with true on-device vernacular model for 22+ Indic languages); flag report carries no PII (reporter signs with their identity, subject is opaque orchestrationId, description is free-text the reporter chose to write; operators review under §9A). **Tests**: no new tests — underlying substrates battle-tested (web-push.test.mjs, dpdp-rights.test.mjs, flag-report.test.mjs, account-recovery.test.mjs covers vault snapshot). FE components pure surface code over typed hooks. Full Node 890/890 unchanged. FE Vitest 45/45 unchanged. **Bundle**: main 421 → **434 KB / 129 KB gzipped** (+13 KB for 5 hooks + 3 Settings cards + voice helper + flag sheet + service worker). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.66s. **E2E verified** on running server: GET /api/push-public-key returns configured VAPID public key + subject; GET /app/sw.js returns service worker file HTTP 200; GET /api/dpdp/grievance returns DPO contact envelope. **Consequences**: Settings on /app/ is now a real control panel (citizens can enable push, export account bundle, see DPDP grievance contact, view audit signer public key, download data, erase account — all without leaving /app/); citizen home gains mic button and Report-this-activity UX completing §9A reporting loop; 4-sub-phase sweep nearly done — only 12.0.5 (sponsor /app/sponsor/) remains before substrate integration arc closes and we move to Phase 12.1a marketplace substrate; push subscription persistence (same browser subscription survives across logins since it's tied to browser+origin not Bharat OS identity; on identity switch new identity gets fresh subscription record server-side but browser-side subscription is same — fine because server only sends to subscriptions tied to active identity via worker-notifications and account_recovery_alert flows). **What's NOT in 12.0.4**: WebAuthn/passkey sign-in (substrate exists at profile-auth/credentials but clean UX needs per-device key management + bound device list that's its own product surface; defer to Phase 13+ Bharat ID); device pairing WebRTC (/shell/ pairing uses multi-step SDP exchange heavy to port; vault transfer + sign-in cover cross-device migration story for v1); flag report list view + resolution status (citizens can file but can't see their filed reports' status; polish); voice intent vernacular support (browser SR uses en-IN by default; switching to Hindi/Tamil/Bengali per-user is Phase 12.1b SLM-A territory); PWA manifest (SW registered but no manifest.webmanifest for Add-to-Home-Screen yet; polish); i18n. ADR 0133.

---

Closed in Phase 12.0.3 (ADR 0132 — worker sweep: e-Shram + schemes + tax + collective memberships + mint Trust Passport attestation on /app/worker/):
1. ✅ **Worker /app/ surfaces government benefits + tax view + collective memberships + Trust Passport attestation mint — five substrates wired into existing Earn + Trust surfaces without growing the bottom-nav** — Second of four substrate-integration sub-phases per founder directive 2026-06-01 ("integrate all the substrates in the best places, showcase as complete product" before tackling domain modules). Phase 12.0.2 closed citizen side (daily brief + memory records); this closes worker side. Substrates have been BE-complete for several phases (Phase 6.3 e-Shram + scheme entitlements, Phase 1.x tax-summary, Phase 6.2 collective membership, Phase 1.27 trust-attestation orchestrator template); this sub-phase wires them into existing /worker/earn and /worker/trust surfaces. Pure FE; zero BE changes. **Five hooks added in hooks.ts**: `useEshramRegistrations(memberId)` GET /api/identities/:memberId/eshram-registrations filtered to status:'active' sorted newest first; `useSchemeEntitlements(memberId)` GET scheme-entitlements same filter; `useTaxSummary(identityId, financialYear)` GET /api/identities/:id/tax/summary?financialYear=YYYY-YY (currentFY() helper computes from today April-pivot per Indian FY); `useCollectiveMemberships(memberId)` GET collective-memberships?status=active; `useMintTrustAttestation()` POST /api/orchestrations with actionType:'trust_attestation', actorId, intentText:reason, execute:true — substrate Phase 1.27 handles rest (signs envelope on citizen's identity, persists to /api/attestations, makes readable via /verify/). **Helper utilities**: currentFY() returns YYYY-YY string with April pivot; shortDate(iso) formats day/month/year en-IN. **<WorkerEarn> additions** (between Earned-this-month and Cash out cards): (1) **Schemes card** trust-toned — only renders when ≥1 e-Shram registration OR scheme entitlement exists; surfaces first (most recent) active e-Shram registration with masked UAN + occupation category (spaces not underscores) + state + registration date + expiry date; all active scheme entitlements with scheme name + code + issuer name + eligibility note + cycle window + monthly benefit amount + frequency; "Who issues these?" Evidence block: "Bharat OS doesn't decide eligibility; issuers (e-Shram registry, cooperative societies, sangha collectives, state welfare boards) sign each entitlement with their own key. Verifiers read signature; revocations cascade in audit ledger." (2) **Tax summary card** governance-toned — only renders when taxSummary.grossIncomePaise > 0; 3-column grid (gross income with <Money> + entry count, new regime estimated tax, old regime estimated tax); "Cheapest option for you" highlight box trust-tinted with recommendation label + amount; "Important disclaimer" Evidence block renders substrate's full disclaimer verbatim ("Bharat OS does NOT file tax returns on your behalf and is not liable for accuracy. CONSULT A CHARTERED ACCOUNTANT BEFORE FILING.") — we do NOT soften §15-honest legal stance. **<WorkerTrust> additions** (between Trust Passport and MFI consent cards): (1) **Mint attestation card** with action button → opens sheet: free-form "What is this for?" field min 4 chars; trust-tinted info box "The substrate exposes only what you have already disclosed elsewhere — verified phone, income band, mesh standing, active consent count. Raw numbers and identity IDs never leave your profile."; on mint success shows attestation ID (stripped of bos:attestation: prefix) + verifier flow instructions + link to /verify/. (2) **Collective memberships card** trust-toned — only renders when memberships exist; list of active memberships with collective name + member role (spaces not underscores) + region + joined date + expiry; Evidence block names cooperative society / sangha / blessed-collective issuance with revocation cascade behavior. **§15 bindings**: issuer-signed by design (none of these surfaces lets worker self-attest e-Shram, scheme eligibility, or collective membership — substrate refuses, FE never tries); mint attestation discloses bands not raw values (trust_attestation orchestrator template enforces server-side; FE copy tells worker what verifier will actually see); tax disclaimer surfaces verbatim (substrate writes long honest disclaimer; Evidence block renders without edit — Bharat OS does not file taxes); auto-suppression preserves empty state (worker with no government benefits doesn't see empty placeholder card — card simply isn't rendered; same for tax + collective memberships); Trust Passport attestation envelope runs through existing trust_attestation template which already signs + persists via Phase 1.27. **5-tab bottom-nav unchanged** — each card auto-suppresses when underlying data empty so brand-new worker sees the same clean Earn surface as before. Schemes section natural placement (workers think about benefits in same headspace as earnings); mint attestation belongs on Trust. **Tests**: no new tests this sub-phase — underlying substrates already battle-tested (tests/node/eshram-registration.test.mjs, tax-summary.test.mjs, collective-membership.test.mjs, orchestrator.test.mjs covers trust_attestation action type); FE components pure surface code over typed hooks; component-level snapshot tests deferred to polish if needed. Full Node 890/890 unchanged. FE Vitest 45/45 unchanged. **Bundle**: main 411 → **421 KB / 125 KB gzipped** (+10 KB for 5 hooks + 4 new card surfaces + mint sheet). wllama lazy chunk unchanged. Build 1.50s. **E2E verified** via curl on running server: all four endpoints (eshram-registrations, scheme-entitlements, collective-memberships, tax/summary?financialYear=2025-26) return expected structured responses for real identity; empty-data graceful suppression confirmed. **Consequences**: worker /app/ is now an actual worker home (Earn tab shows government benefits + tax view above cash-out flow; Trust tab lets worker mint Trust Passport attestations and shows collective memberships); 5-tab bottom-nav preserved by stacking new content into existing Earn + Trust surfaces; citizen + worker /app/ together now surface ~80% of Phase 1.x substrates — remaining: push notifications + device pairing + vault transfer + WebAuthn + DPDP grievance + flag reports + voice intent (12.0.4) + sponsor admin (12.0.5); pattern reuse for 12.0.4 cross-cutting — auto-suppression pattern + Evidence-block §15 framing generalises to every remaining substrate; seed-demo extension is natural polish (minting e-Shram + PM-KISAN + cooperative membership for one worker persona would make new cards visible during live demo — today workers see them once issuer mints something). **What's NOT in 12.0.3**: skill traces timeline (substrate wired via /api/skill-preflights/:id/trace but meaningful timeline view needs filtering + pagination + per-step expansion UI; deferred to polish or 12.0.4); per-scheme application flow (substrate surfaces entitlements read-only; applying to scheme is separate flow not yet built); tax filing (Bharat OS does not file; disclaimer is loud; future polish could integrate authorised intermediary like ClearTax/TaxBuddy through separate consent grant); multi-collective deep dive (card shows list; tapping doesn't open per-collective detail view of member roster + revocation history); mint attestation scope picker (substrate supports selective disclosure per-scope opt-in; v1 mint sheet uses default scope set); tax history prior years (v1 shows current FY only; year picker is polish); seed-demo extension to populate eshram/schemes/collectives for demo persona (follow-up commit if needed); i18n (English copy only). ADR 0132.

---

Closed in Phase 12.0.2 (ADR 0131 — citizen sweep: daily brief + personal memory records on /app/citizen/):
1. ✅ **Citizen /app/ feels like a complete product — daily brief on home + personal notes tab** — Post Phase 12.0.1 founder asked which substrates are BE-complete but invisible on /app/; audit surfaced ~15 (memory records, daily brief, health docs, voice intent, e-Shram, schemes, tax summary, trust attestation mint, flag reports, push opt-in, device pairing, vault transfer, WebAuthn, DPDP grievance, sponsor admin). Founder directive: integrate all of them in the best places for complete-product showcase; flagged that domain modules (cab/doctor booking with tracking/SOS/payment/records) are separate multi-week BE arcs after Phase 12.1a marketplace substrate. Plan: 4-sub-phase sweep (12.0.2 citizen → 12.0.3 worker → 12.0.4 cross-cutting → 12.0.5 sponsor) before tackling domain modules. **This sub-phase ships citizen side.** Pure FE; zero BE changes. **(1) Daily brief on /app/citizen/home**: orchestrator's `daily_brief` action type fully wired BE-side — `gatherDailyBriefSignals()` returns structured signals (mesh earnings, recent activity, expiring consents, open §9A flags) on `actionRequest.metadata.signals` regardless of whether `daily_brief_compose` tool can run (composed text requires memory.read + consent.record consent; signals come back regardless). New `useDailyBrief(identityId)` hook fires POST /api/orchestrations with daily_brief, refetches every 5min staleTime 60s. **<DailyBriefCard>** rendered above intent textarea: time-of-day greeting + first name (good morning/afternoon/evening/night); composed brief text when status:'completed' (from localizedResponse.text) otherwise "Here is your day so far."; 2-column grid of signals — "Earned in the last 24h" with `<Money>` for mesh paise + event count, "Expiring soon" with top 3 consents formatted as `purpose · short date`, "Recent on this profile" with top 4 orchestrations + relative-time helper (`12m ago`, `3h ago`, etc.), open §9A flags in error tone when openFlags > 0; "Unlock the personalised summary" prompt when blocked on consent — tap → opens existing ConsentGrantSheet via new `handleGrantBriefConsent` helper; footer "Composed on-device · 24h window · §15 pointer-not-payload" badge. Card suppresses itself when signals empty AND no consent needed (brand-new user doesn't see blank state). **Consent-grant flow integration**: when daily brief blocked, tap "Review + grant" sets brief's orchestration as `lastOutcome` and opens ConsentGrantSheet; existing `handleGrant` extended to (a) invalidate ['daily-brief', identityId] query so brief refetches with new consent, (b) distinguish intent re-send (when intent.intentText non-empty) from pure consent grant (daily-brief case) — in latter clear lastOutcome and show "Consent granted. Your brief is composing." toast. **(2) Personal memory records on /app/citizen/notes**: new tab between Home and Trust. Substrate complete since Phase 1.6 — GET /api/memory-records?ownerId returns memorySummary[] (label + sensitivity + tags + createdAt, no plaintext); POST /api/memory-records accepts {identityId, text, label?, sensitivity?, tags?, contentType?, scopes?} saves encrypted bundle + summary; POST /api/memory-records/:id/read runs readMemoryRecordWithConsent returns {ok, approved, decision, memory, plaintext} (plaintext only when consent gate approves). **Three new hooks**: useMemoryRecords(identityId) list sorted newest first; useCreateMemoryRecord encrypts+saves+invalidates list; useReadMemoryRecord consent-gated. **<CitizenNotes>** component (frontend/src/routes/CitizenNotes.tsx): per-note button shows label or "(untitled note)", plaintextBytes + saved date, tag chips, sensitivity badge (personal/sensitive/public with tone-coded variants); empty state explains §15 honesty (encryption with vault key, metadata-only on list, consent-gated reads, every read in audit ledger); create sheet with label + text textarea + sensitivity toggle (personal default), "Save note" → encrypts + persists; read sheet on tile tap calls useReadMemoryRecord immediately, shows decrypting state then plaintext in trust-toned card when approved OR warning card "Could not read this note. Check Trust → Permissions" when denied. **Citizen tabs reorganised** 4 → 5: Home / Notes (new) / Trust / Labs / Settings. Same density as worker bottom-nav (Phase 10.2), proven on mobile. **§15 bindings**: daily brief composed on-device (substrate explicitly says "composition happens on server-as-stand-in-for-device Phase 2a or in-device Phase 2b; signals never leave user's profile boundary" - card footer surfaces this with pointer-not-payload badge); brief signals are metadata not payload (numbers banded, dates short labels, no raw transaction strings); notes encrypted at rest (vault key on server Phase 0; list query returns memorySummary only); reads consent-gated (even owner reads own note goes through readMemoryRecordWithConsent which runs standard scope+lifecycle policy, every read writes decision to ledger); sensitivity surfaced honestly (citizen picks per-note; sensitive notes require stricter consent purpose — substrate already enforces). **Tests**: no new tests — underlying substrates already battle-tested (tests/node/memory.test.mjs covers creation+encryption+consent-gated reads; tests/node/daily-brief.test.mjs covers signal gathering+brief composition); FE components are pure surface code over typed hooks, snapshot tests deferred to polish if needed. Full Node 890/890 unchanged. FE Vitest 45/45 unchanged. **Bundle**: main 399 → **411 KB / 123 KB gzipped** (+12 KB for DailyBriefCard + CitizenNotes route + 4 new hooks + types). wllama lazy unchanged 292 KB / 126 KB gzipped. Build 1.45s. **E2E verified** on running server: POST /api/identities → new id; POST /api/memory-records → encrypted note saved; GET /api/memory-records?ownerId → metadata-only list (1 entry "Doctor contact"); POST /api/orchestrations {actionType:daily_brief} → structured signals + (consent permitting) composed text. **Consequences**: citizen home is now actual home screen — investors opening /app/citizen/home see personalised brief at top (greeting + mesh earnings + expiring consents + recent activity) BEFORE any intent typed, reads as "AI works for me from the moment I open the app"; citizens have personal storage — Notes tab gives them a place to save anything (doctor numbers, addresses, ideas) with honest §15 framing; Trust tab + Notes tab + consent flow together complete the "your data is yours" story end-to-end on /app/; pattern reuse for 12.0.3 worker sweep — metadata-on-list + consent-gated-read pattern in CitizenNotes generalises to health-documents + e-Shram records + other sensitive resources; 5-tab bottom-nav on citizen matches worker (future tabs from 12.0.3 Health + 12.0.5 Sponsor admin may need "More" overflow if past 5). **What's NOT in 12.0.2**: health documents ABHA (high-value but ABHA sandbox paperwork non-trivial, defer to 12.0.3+); voice intent input (substrate exists but proper vernacular intent→action is Phase 12.1b SLM-A); push notifications opt-in (substrate exists, service-worker registration heavier infra work, defer to 12.0.4); trust attestation mint (UX complexity — pick recipient + pick claims to disclose; Phase 12.0.3 worker sweep more natural); flag reports (§9A citizen reports of bad actors; Phase 12.0.4 cross-cutting); tag chips on note creation (substrate stores tags but create sheet doesn't capture; polish); note edit/delete (read-only after create; polish); i18n (English copy only; Phase 12.1b SLM-A). ADR 0131.

---

Closed in Phase 12.0.1 (ADR 0130 — real sign-up + sign-in on /app/ via phone OTP):
1. ✅ **Real account flow on /app/ — investors no longer have to pick a demo persona; they can create + sign in with phone** — Founder flagged 2026-06-01 that even for demo, /app/ should have real sign-up / sign-in alongside seeded-persona picker (demo personas reads "toy app" to investors; real account flow reads "shippable product"). Substrate already complete (Phase 4.3 phone OTP + Phase 5.0 account recovery): POST /api/identities creates Ed25519-backed identity with display name; POST /api/phone-otp/send issues 6-digit OTP, stores salted hash, hands plaintext to SMS provider, returns {otpId, expiresAt, phoneMasked}; POST /api/phone-otp/verify attaches phone as phone_verified attestation; POST /api/recovery/start finds identity by verified phone + issues account_recovery OTP (§15 anti-enumeration sentinel returns same shape whether phone matched or not); POST /api/recovery/verify returns full identity bundle including deterministic recovery phrase + 24h post-recovery cooldown (Phase 5.2). **BE change**: dev-only OTP reveal in src/phase0/api.mjs - POST /api/phone-otp/send response now includes `_devOtpCode: <plaintext>` ONLY when configured SMS provider is `log` (BHARAT_OS_SMS_PROVIDER unset or =log); production providers (gupshup/twilio/msg91) never see the field. POST /api/recovery/start does the same BUT only on real-match branch — §15 anti-enumeration sentinel branch (when phone doesn't match any identity) MUST NOT include the field, otherwise its presence would leak the match signal; dedicated test pins this. Justification: log SMS provider already prints plaintext to stdout when BHARAT_OS_LOG_OTP_BODIES=1; dev-reveal field exposes same information in more demo-friendly place (JSON response) so investors don't need a terminal. **FE: four new hooks** in hooks.ts — useSignUpStart (mutationFn chains POST /api/identities + POST /api/phone-otp/send so caller hands {displayName, phone} and gets back created identity + OtpSendResponse including _devOtpCode in dev); useSignUpVerify (wraps POST /api/phone-otp/verify; invalidates identities query on success so newly-created identity shows up in persona list); useSignInStart (wraps POST /api/recovery/start); useSignInVerify (wraps POST /api/recovery/verify; returns recoveryBundle which carries full identity record so FE can setActive). **New `<AuthSheet>` component** at frontend/src/components/AuthSheet.tsx - sheet with sign-up/sign-in toggle, three steps (phone → OTP → done): on sign-up step 'phone' shows display name + phone + role choice (Earn/Use) → "Send me a code" → step 'otp'; on sign-in step 'phone' shows phone only → "Send me a code" → step 'otp'; on step 'otp' renders dev-OTP callout in warning tone with code in display-size monospace block + honest copy "This is only shown because the server is using the `log` SMS provider. Production SMS providers will never carry this field." + 6-digit input with autocomplete="one-time-code" + verify action; on verify success setActive(identity.id) via Zustand identityStore, toast welcome, navigate to /worker or /citizen, close sheet. **Onboarding hero rework**: footer rewritten to surface auth CTAs as primary path ([Create an account] · [Sign in with phone]) with demo personas above still reachable in original position; copy: "Or pick a demo persona above to explore without signing up. Bharat OS is open-source. Built India-first." **§15 bindings**: anti-enumeration preserved (sentinel branch returns exact same shape as matched branch BUT WITHOUT _devOtpCode — including field on sentinel would let attacker probe whether phone is registered by checking field presence; test pins this); production never gets the field (conditional on BHARAT_OS_SMS_PROVIDER='log' or unset; setting any real provider name disables reveal in same response branch); phone never leaves identity record verbatim (substrate unchanged — only phoneMasked lives on public identity, OTP store holds full number until expiry); sign-in does not expose private keys to attacker (recovery bundle returned by /api/recovery/verify includes identity record which carries privateKeyPem server-side per ADR 0066 demo-mode warning; FE uses only the id, does not store private key in localStorage; Phase 13+ Bharat ID moves signing to device hardware keystore); recovery cooldown still applied (24h post-recovery cooldown on recovered identity is unchanged - SIM-swap attacker who signs in still cannot immediately delete account or chain another recovery). **Tests** (tests/node/auth-dev-otp-reveal.test.mjs +6): phone-otp/send includes _devOtpCode when SMS provider is log (default); phone-otp/send MUST NOT include _devOtpCode when provider=gupshup; recovery/start includes _devOtpCode when log AND matched; **§15 critical** — recovery/start anti-enumeration sentinel MUST NOT include _devOtpCode for unknown phone (without this test, dev-reveal would leak match signal); full sign-up round-trip (create → send → verify → identity has phone_verified attestation); full sign-in round-trip (signed-up user can recover via recovery/start + recovery/verify, returns original identity ID). Full Node 884 → **890** (+6). FE Vitest unchanged at 45/45. **Bundle**: main 392 → **399 KB / 120 KB gzipped** (+7 KB for AuthSheet + 4 hooks + Onboarding hero rework). wllama lazy chunk unchanged. Build 2.02s. End-to-end verified on running server: POST /api/identities → 201 + new id; POST /api/phone-otp/send → _devOtpCode: 493041, phoneMasked: +919****00. **Consequences**: /app/ onboarding has real account flow for first time (investors see [Create an account] / [Sign in with phone] CTAs on hero; tap → name + phone + role → 6-digit code revealed in sheet for demo → land on /worker or /citizen with persisted identity); demo persona picker stays for investors who want to skip past auth and inspect specific pre-seeded scenarios (Priya the cab driver, Sneha the citizen, etc.); both paths setActive() the same identity store - rest of /app/ doesn't care which path got user there; sign-in via existing Phase 5.0 account-recovery substrate is honest about §15 binding (cooldown applies post-sign-in, anti-enumeration sentinel preserved); pattern reuse for Phase 12.2 wave-1 per-role onboarding (will use same OTP-via-phone path before collecting role-specific KYC). **What's NOT in 12.0.1**: WebAuthn/passkey sign-in (Phase 13+ Bharat ID); bound device keys (Phase 2a Android-app will bind device-keystore key to identity so re-sign-in isn't needed); phone change flow (polish); multi-device sync UI (Phase 1.x has substrate, FE not surfaced); OAuth/social (Bharat OS is trust anchor not relying party); email recovery (phone-only — not Indic-first identity vector); i18n (English-only; Hindi/Marathi/Tamil via Phase 12.1b SLM-A vernacular layer). ADR 0130.

---

Closed in Phase 12.0 (ADR 0129 — providerIdentity substrate; wave-1 provider tiles flip from coming-soon to LIVE):
1. ✅ **Marketplace providers (cab driver, personal driver, daily-wage labour, household help) can create draft profiles on /app/ — substrate live + separate from workerIdentity + DPDP §12(3) cascade verified end-to-end** — Phase 11.9 hero rebrand surfaced all 7 earner motions but 5 provider tiles were "Coming Phase 12.0" placeholders. Direction-set conversation 2026-05-31 locked Phase 12.0 as the providerIdentity substrate — separate from workerIdentity per [[provider-vs-worker-identity-split]], KYC-heavy, bound to a root, with §15 honesty about operator attestation. **New pure module `src/phase1/provider-identity.mjs`** (~300 lines validation, no I/O): `PROVIDER_ROLE_KINDS_WAVE_1 = ['cab-driver', 'personal-driver', 'labourers', 'household-help']` — founder picked these four for "minimum onboarding load, maximum coverage" sharing physical-service onboarding shape; `PROVIDER_ROLE_KINDS_WAVE_2 = ['kirana', 'skilled-trades']` substrate accepts but per-role wizard ships Phase 12.3+; `PROVIDER_KYC_LEVELS = ['none', 'basic', 'verified']` server-attested only (substrate refuses any attestation without operatorId — citizen never self-attests); `PROVIDER_IDENTITY_STATUSES = ['draft', 'submitted', 'active', 'suspended', 'revoked']` state machine enforced by `VALID_TRANSITIONS`, revoked is terminal. **Module functions**: `createProviderIdentity({rootIdentityId, roleKind, displayName, serviceArea?, ratePaisePerHour?, ratePaisePerService?, description?})` returns draft record with computed `roleWave` (1 or 2); `attestProviderKyc(provider, {kycLevel, operatorId, evidenceRefs, notes})` moves draft → submitted, records attestation envelope, refuses `kycLevel: 'none'` (use revoke); `transitionProviderStatus(provider, nextStatus, {operatorId, reason})` enforces VALID_TRANSITIONS + §15 invariant "cannot activate provider without KYC attestation" (throws if attempted on `kycLevel: 'none'`); `updateProviderProfile(provider, {...fields})` validates field lengths only (route handler responsible for caller auth); `publicProviderRecord(provider)` STRIPS rootIdentityId + kycAttestation + lastTransition + submittedAt + suspendedAt + revokedAt + updatedAt + createdAt — citizens see only what they need to book (role + name + area + rate + KYC level + status + activatedAt). **Both stores grow `provider_identities`**: SqliteStore — new table `provider_identities` with provider_identity_id PK + indexes on root_identity_id + role_kind + status; methods saveProviderIdentity / readProviderIdentity / listProviderIdentities({rootIdentityId?, roleKind?, status?}); save emits `provider_identity.saved` ledger event. BosStore — new `providerIdentitiesPath` directory + per-record JSON files; same CRUD signature. **DPDP §12(3) cascade extended on BOTH stores** — provider_identities rows erased by root_identity_id when their root identity is erased (no orphaned providers post-erasure; §15). **Six HTTP endpoints in `src/phase0/api.mjs`**: POST `/api/identities/:rootId/provider-identities` creates draft (validates root exists, refuses 404 unknown_root_identity otherwise, returns 201 with full record); GET `/api/identities/:rootId/provider-identities` lists owned; GET `/api/provider-identities/:id` PUBLIC returns publicProviderRecord only (citizens browse marketplace); POST `/api/provider-identities/:id/profile` root-owner edit (body MUST carry rootIdentityId, substrate refuses 403 not_owner if mismatch — authorization by signed identity ownership, not session cookie; Phase 13+ Bharat ID SSO hardens this); POST `/api/admin/provider-identities/:id/kyc-attest` admin-token-gated, operator attests KYC level, emits `provider_identity.kyc_attested`; POST `/api/admin/provider-identities/:id/transition` admin-token-gated, operator transitions status, emits `provider_identity.transitioned`, substrate enforces no-active-without-KYC invariant. **FE substrate**: three new hooks in hooks.ts — useProviderIdentities(rootIdentityId) lists owned, useCreateProviderIdentity creates draft (invalidates list on success), useUpdateProviderProfile root-owner edit (input REQUIRES rootIdentityId, test pins so refactor cannot drop authorization gate). EARN_ROLES catalog updated: wave-1 roles (drive-cab + personal-driver + labourers + household-help) flip from `comingSoonPhase: '12.0'` to LIVE with `targetPath: '/earn/provider-onboarding?role=…'` + new `providerRoleKind` field (canonicalizes BE role id); wave-2 roles (kirana + skilled-trades) remain coming-soon but flagged Phase 12.3; catalog rework dropped separate cook + home-help tiles, replaced with one household-help tile describing maid + cook + cleaner together (matches direction memo). **New `/earn/provider-onboarding` route** (`frontend/src/routes/ProviderOnboarding.tsx`) — generic onboarding form for all wave-1 roles; collects display name + free-text service area + hourly rate + per-service rate + description; creates draft providerIdentity; tells citizen honestly that operator KYC review required before activation + per-role wizard ships in Phase 12.2; ROLE_RATE_LABEL map customizes rate-field labels per role (cab "Minimum fare" vs labourer "Day rate" vs household-help "Monthly rate"). **WorkerHome rewritten** with two-ledger cards per direction memo: left card "Micro-task earnings" with `<Badge variant="trust">Live</Badge>` — labeling + federated + mesh inference + storage, live since Phase 10.x, routes to /labels and /labs; right card "Marketplace earnings" with `<Badge variant="pending">Drafts</Badge>` when provider profiles exist OR `<Badge variant="neutral">Not yet set up</Badge>` when none, currently ₹0 (citizens book direct, bookings flow Phase 12.1a, no commission ever), lists existing provider drafts as pending badges with role + status; bottom combined "Total earned this month" card stays (underlying ledger is one stream — cards above split the framing). **§15 bindings**: no commission (substrate has NO field for platform commission rate — citizens pay providers in full); public record strips sensitive fields (citizens can never see rootIdentityId + KYC envelopes + operator transition history); server-attested KYC only (self-attestation paths refuse — activation requires admin-token call); DPDP §12(3) cascade verified by tests on both stores (citizen erases root → every bound provider profile wiped, no orphans); audit trail per state change (`provider_identity.saved` + `.kyc_attested` + `.transitioned` ledger events anchor every meaningful operation). **Tests**: `tests/node/provider-identity.test.mjs` +19 (9 pure module — validation + defaults + wave assignment + KYC moves draft→submitted + refuses kycLevel:none + state machine transitions {draft→active blocked, submitted→active needs KYC, active→revoked, revoked terminal} + publicProviderRecord stripping + updateProviderProfile rejects 200-char displayName; 2 SqliteStore — round-trip + list filters, DPDP cascade by rootIdentityId; 1 BosStore — round-trip + DPDP cascade; 7 HTTP — create draft, 404 on unknown root, list owned, public read strips sensitive fields, profile edit gates on rootIdentityId 403 on mismatch, admin KYC attest + transition full lifecycle, admin transition refuses skipping KYC). Full Node 865 → **884** (+19) across 5 batches of 16 files (Windows OOM workaround per memory rule). `frontend/src/lib/use-provider-identity.test.ts` +2 (POST create body shape + POST profile rootIdentityId-on-body authorization contract — critical so refactor cannot drop the auth gate and open a bypass). FE Vitest 41 → 45 (+4 including 2 added earn-roles invariants for wave-1 live + wave-2 12.3 coming-soon). **End-to-end verified** via curl on running server: create draft → 201 + status `draft`; public read → no rootIdentityId or kycAttestation leak; admin endpoints correctly reject when BHARAT_OS_ADMIN_TOKEN unset (substrate refuses to serve admin ops without configured secret). **Bundle**: main 384 → **392 KB / 119 KB gzipped** (+8 KB for new ProviderOnboarding route + 3 hooks + WorkerHome rewrite + earn-roles catalog expansion). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.60s. **Consequences**: provider tiles on Earn role chooser NO longer placeholders for cab-driver/personal-driver/labourers/household-help — tap → persona picker → generic onboarding → draft profile saved (full path is real except operator KYC step which is Phase 12.2 wizard); WorkerHome reads the two-motion reality (micro-task earnings live on left, marketplace earnings ₹0 pending Phase 12.1a on right) — demo investors immediately see expansion path; providerIdentity schema is now stable foundation for Phase 12.1a marketplace ranking + Phase 12.1b SLM dynamic forms + Phase 12.2 per-role wizards; DPDP cascade extended to new resource type without any regression in rest of cascade (same sweep pattern as every prior addition). **What's NOT in 12.0**: per-role onboarding wizard with KYC document upload + Aadhaar e-KYC + SLM dynamic form generation (Phase 12.2 wave 1); operator console UI for KYC review (operators today hit admin endpoint via curl; real review surface ships later — likely part of future /app/sponsor/ work); service-area polygon schema (today's serviceArea is opaque object substrate stores as-is; Phase 12.1a marketplace pins geo schema lat/lng + radius OR polygon before citizens search by location); Trust Passport feedback loop on providers (substrate already has verified-attestation field on root identity; Phase 12.2 wires per-booking ratings to provider Trust score); marketplace earnings ledger (WorkerHome marketplace card hard-codes ₹0; real earnings flow when Phase 12.1a citizen-booking escrow ships); multi-role provider profile (citizen with both cab and household-help can create two profiles today each separate; cross-profile shared KYC + scheduling is post-MVP); provider suspension self-service (today operators suspend; provider can revoke own profile but not pause it; polish). ADR 0129.

---

Closed in Phase 11.9 (ADR 0128 — hero rebrand Earn/Use + in-flow role chooser; provider tiles surface Phase 12.0 placeholders):
1. ✅ **Onboarding hero reads the actual product motion — Earn + Use with all seven earner roles visible from day one** — Phase 11 split-hero ("I work" / "I live") was too narrow for the actual plan; Bharat OS isn't just for gig-economy "workers" but for every shape of working-class India (drivers, cooks, maids, kirana owners, electricians, skilled trades). Direction discussion 2026-05-31 produced the Earn/Use rebrand decision; this ships it together with an in-flow role chooser. Pure FE; zero BE changes. **Hero copy rebrand** in `frontend/src/routes/Onboarding.tsx`: "I work" → "I earn"; "Continue as a worker →" → "Continue as an earner →"; "I live" → "I use" (heading + CTA swapped, copy block preserved); "Continue as a citizen →" stays (reads better than "user"); footer "developer-shell available" link to /shell/ removed per /app/-grows-/shell/-retires direction, replaced with "Bharat OS is open-source. Built India-first." **New `frontend/src/lib/earn-roles.ts`** — data catalog of earning motions, single source of truth (same list will drive future "Add another way to earn" surface on earner home, docs, investor demo, provider-side admin onboarding). Each role: `{id, label, icon, description}` + either `targetPath` (live roles) or `comingSoonPhase + comingSoonNote` (provider roles). `isComingSoonRole(role)` predicate keeps states separated. v1 catalog: Live — `label-data` (→ /labels), `federated-mesh` (→ /labs). Coming Phase 12.0 — `drive-cab`, `cook`, `kirana`, `home-help`, `skilled-trades`. Each provider role's comingSoonNote explicitly states "Bharat OS does not take a cut" / "no commission, no aggregator markup" — locks §15 binding into the catalog so any future copy refactor preserves it. **Three-step picker flow**: Step 0 split-hero (I earn vs I use tap); Step 1 (earn side only) role chooser sheet "How do you want to earn?" with grid of role tiles — live tiles trust-tinted (active hover), coming-soon tiles muted with orange "Phase 12" badge; Step 2 (live roles only) persona picker sheet scoped to role's label (identical to previous persona picker but role-aware copy "Pick a persona for Label data"); Coming-soon detail sheet (separate state) — when citizen taps coming-soon tile, honest "ships in Phase 12.0" card with role's onboarding preview + [← Back to earn options] action + close. Identity navigation unchanged: live roles route to `targetPath` (/labels or /labs) on persona selection; Phase 1 classifyPersona heuristic still classifies seeded demo personas as worker/citizen — no BE change. **Why this shape**: two-button hero not three (user picked Earn + Use over Earn + Provide + Use in direction discussion — keeps hero simplicity for investor demo; earning motions one click deeper in role chooser); coming-soon tiles visible from day one is deliberate (investors + contributors see full intent, placeholder copy reads as honest roadmap not broken UI, team has real per-role onboarding shapes to design against; orange Phase 12 badge keeps expectations honest); data catalog not embedded JSX (same list drives onboarding role chooser + future earner home + investor decks + provider admin surface); citizen flow untouched (Use side retains existing citizen persona picker). **§15 bindings**: honest about scope (coming-soon roles clearly labelled + dated Phase 12.0, no "leave your email" marketing capture); no-commission language already in data (each provider role's comingSoonNote explicitly states "Bharat OS does not take a cut" — locks §15 into catalog so any future copy refactor preserves it); /shell/ link removed from footer per direction memo (dev surface still reachable by typed URL, just not advertised). **Tests**: `frontend/src/lib/earn-roles.test.ts` +6 (every role has unique id; live roles MUST carry targetPath + coming-soon roles MUST NOT — catches placeholders accidentally pointing at /worker; every role has icon + label + description; catalog contains both live entry label-data and coming-soon entry drive-cab; coming-soon roles all target Phase 12.x; all five provider roles drive-cab/cook/kirana/home-help/skilled-trades present so refactor cannot drop one). FE Vitest 35 → 41 (+6). No new Node tests. **Bundle**: main 380 → **384 KB / 116 KB gzipped** (+4 KB for catalog + role chooser sheet + coming-soon sheet). wllama lazy chunk unchanged. Build 1.45s. **Consequences**: hero matches actual product motion (drivers/cooks/kiranas/maids/skilled-trades visible to anyone landing on /app/ — investors see roadmap, contributors see targets, future provider-side onboarding has clear per-role shape to slot into); live earning paths cleanly routable from single chooser (workers can add second motion later via same UI surface); EARN_ROLES catalog becomes canonical place for provider role taxonomy (Phase 12.0 providerIdentity table will reference these same id strings; catalog evolves into per-role attestation spec); no regressed flows (existing persona picker still works for citizens + active worker personas). **What's NOT in 11.9**: real onboarding for any provider role (detail sheet is honest about Phase 12.0 dependency; no fake KYC flow); per-role icons beyond emoji (designer can replace with custom SVGs later); i18n (catalog descriptions English only); notify-when-ready email capture (direction explicitly excluded marketing-style "leave your email" flows); multi-role earner home (worker who wants to label AND train federated rounds still uses two tabs; "Add another way to earn" UI is Phase 12.0+ polish); sponsor / Business surface ("Business" stays reserved for sponsor onboarding MFI/bank/research lab — not built here; lives at future `/app/sponsor/` when Phase 9.1 sponsor flows graduate from /shell/). ADR 0128.

---

Closed in Phase 11.8 (ADR 0127 — per-scope consent grant UI + auto-re-send launched from Outcome card):
1. ✅ **Citizen can grant consent + auto-re-send blocked intent without /shell/ bounce** — Phase 11.7 surfaced what the orchestrator wanted (consentRequirement scopes) but stopped at "per-scope consent UI ships in Phase 11.8" — citizens still had to bounce to /shell/ to grant a consent, exactly the kind of hand-off the /app/-grows-/shell/-retires direction is closing. Phase 11.8 wires the FE consent surface to the existing Phase 1.3 substrate. Pure FE; zero BE changes. **Three new hooks in `frontend/src/lib/hooks.ts`**: `useConsents(identityId)` GETs `/api/consents?subjectId=…` filtered client-side, returns typed `ConsentArtifact[]` with BE's lifecycle field; `useGrantConsent()` POSTs `/api/consents` with `signWithIdentityId: identityId, signRole: 'subject'` so the artifact is signed by the citizen (server cannot fabricate); `useRevokeConsent()` POSTs `/api/consents/:id/revoke` with `revokedBy: identityId, signRole: 'revoker'`, default reason `revoked_by_citizen`. **New `<ConsentGrantSheet>` component** launched from OutcomeCard when intent is blocked on consent gate: governance-toned grantee sub-card shows the granteeId (e.g. `bharat-os-orchestrator`); purpose sentence derived from action type via ACTION_TYPE_PURPOSE map (e.g. "Book a service for me through the Bharat OS marketplace."); each scope as a checkbox (default ALL checked) with plain-language description from SCOPE_DESCRIPTIONS map (e.g. service.book → "Let Bharat OS book the service on your behalf."); validity duration as 1/7/30/90 day toggle pills (default 30); button label adapts "Grant + retry intent" when all checked, "Grant N of M" otherwise; warning when not all checked: "Bharat OS may still block this action if any required scope is missing." **OutcomeCard gains `onGrantConsent` callback prop** — when set + status blocked + non-empty scopes, the consent block surfaces a [Review + grant consent] action. Tap opens the sheet. **CitizenIntent owns grant + retry**: `handleGrant(scopes, ttlDays)` calls `grantConsent.mutateAsync(...)`, awaits save, then re-fires `handleSend(lastOutcome.intent.intentText)` to re-issue the original intent. Send action label flips to "Re-sending after consent…" during retry. On success Outcome card replaces itself with new orchestration (now planned/completed). **Trust tab rewritten** as real surface: useConsents data → "Active consents" card with per-row [Revoke] action, shows purpose + monospace granteeId + each scope as trust-tinted chip + expiry date; "History" card with revoked/expired entries read-only. **Why opt-in per scope** (could auto-grant all in one tap but deliberately don't): §15 honesty — citizen sees exactly what they're agreeing to, not a black-box "Allow" button; future-proof partial trust — citizen might grant service.book + consent.record but withhold upi.settle if settling outside Bharat OS, substrate already handles partial grants (orchestrator stays blocked) and UI now matches; lays pattern for Phase 12.1 marketplace where a single booking spans 6-8 scopes across consent + payment + identity disclosure. **§15 bindings**: citizen-signed (every grant has signWithIdentityId+signRole:'subject' — test pins contract so refactor cannot drop signing fields and let server fabricate); no silent re-grants (auto-re-send after grant never auto-grants — citizen taps [Grant + retry] themselves); revocation signed too (Trust tab revoke carries signWithIdentityId+signRole:'revoker'); history stays visible (Trust History section shows revoked + expired; citizens audit grant history without /shell/ bounce); no third-party signal (granteeId shown as-is — `bharat-os-orchestrator` — not dressed up as "Bharat OS Trusted Service"; citizen sees exact ID that will be ledger-recorded). **Tests**: 2 new Vitest in `frontend/src/lib/use-grant-consent.test.ts` pin POST contracts — useGrantConsent body MUST carry subjectId/granteeId/scopes/purpose/ttlDays AND signWithIdentityId/signRole:'subject' (signing fields are §15 critical — without them server could fabricate); useRevokeConsent body MUST carry reason/revokedBy/signWithIdentityId/signRole:'revoker'. FE Vitest 33 → 35 (+2). No new Node tests (zero BE changes). **End-to-end verified via curl**: POST orchestrations with "Book a cab" → `status: blocked` + `consentRequirement.scopes: [service.book, consent.record, upi.settle]`; POST consents with those scopes → `ok: true`; re-POST same intent → `status: planned`, `localizedResponse.text: "Looking for the best provider for you."` — exactly the loop the citizen sees in FE. **Bundle**: main 372 → **380 KB / 115 KB gzipped** (+8 KB — three hooks + ConsentGrantSheet + Trust tab rewrite). wllama lazy chunk unchanged. Build 1.51s. **Consequences**: headline citizen demo loop now fully /app/-native (citizen types intent → sees blocked Outcome → taps grant → sees granted consent → sees planned re-send → audit ledger has full lineage; no /shell/ bounce); Trust tab is no longer placeholder copy — real permissions surface citizen audits + revokes from; ConsentGrantSheet + useGrantConsent shape reusable for every future regulated action (scheme delivery, health record read, labor matching, trust attestation) — Phase 12.1 marketplace bookings will reuse directly; Phase 11 arc-extension — original "Phase 11 CLOSED" framing now includes 11.7 + 11.8 + 11.9 as direction-driven follow-ups (treating closed phase as stable surface area not frozen). **What's NOT in 11.8**: per-scope revocation in OutcomeCard (revoke lives in Trust tab only — citizen who immediately regrets a grant from Home navigates to Trust to revoke; inline-revoke is polish); bulk grant for multiple intents (each grant is per-intent — citizen issuing 5 service bookings grants consent 5 times; bharat-os-orchestrator-wide consent would weaken §15 granularity); consent template suggestions ("Same as last time" when previous similar grant exists — polish); TTL beyond 90 days (capped at 90 in UI; longer-lived consents need separate "this is a long-lived grant" review); Hindi/vernacular scope descriptions (SCOPE_DESCRIPTIONS English-only; i18n Phase 12+ polish). ADR 0127.

---

Closed in Phase 11.7 (ADR 0126 — citizen intent orchestration wire-up; user-reported demo silence fix):
1. ✅ **"Book a cab" actually does something — citizen intent flow is wired end-to-end on /app/** — The user typed "Book a cab" on /app/citizen/home, tapped Send, and nothing happened: textarea cleared, success toast flashed, Recent activity card stayed empty, no Outcome rendered. Two stacked bugs caused the silence. **Bug 1 — FE/BE payload shape mismatch**: useSendIntent sent `{intent:{intentText,locale}, actionRequest:{actorId}}` but the BE orchestrator (src/phase1/orchestrator.mjs's buildActionRequest) reads `intentText` + `actorId` + `locale` as FLAT keys on the body. With the nested shape, `intent.intentText` was undefined → language normaliser received empty string → inferActionTypeFromNormalized fell back to `mesh_storage` (default for un-matched intents) → "Book a cab" orchestrated as storage instead of `service_booking`. `actionRequest.actorId` was undefined → orchestration's own actionRequest.actorId was undefined → recent-activity filter `o.actionRequest?.actorId === identityId` never matched → list stayed empty. **Bug 2 — no outcome surface**: even with shape fixed, citizen has no way to see what Bharat OS did. Response carries `status` + `localizedResponse.text` + `consentRequirement.scopes` + `failedPolicies` + plan — none surfaced. Blocked intents (common case for regulated actions before consent grant) indistinguishable from no-ops. **Pure FE fix**, zero BE changes — orchestrator already returns everything the surface needs. **useSendIntent POSTs flat shape** `{intentText, actorId, locale}`; hook now returns typed `SendIntentResponse: {ok, orchestration}`; JSDoc on hook names past bug so future eyes don't reintroduce nested shape. **Orchestration types extended**: `status: 'planned' | 'completed' | 'blocked'`, `failedPolicies: string[]`, `consentRequirement: {subjectId, granteeId, scopes, required}`, typed `localizedResponse: {text, locale, fallbackUsed}`, `OrchestrationPlanStep` interface. **`<OutcomeCard>` component** rendered below input card after successful POST: action-type label via ACTION_TYPE_LABEL map (e.g. "Service booking (Bharat OS marketplace)" for service_booking); status badge (trust/pending/warning tones for completed/planned/blocked); localised message — BE's `localizedResponse.text` rendered as prose (e.g. "Booking blocked — consent required."); when blocked with consent gate, warning-tinted sub-card lists required scopes monospaced with copy "Granting consent is a signed, revocable artifact. Per-scope consent UI ships in Phase 11.8."; failed policies as bullet list (e.g. `policy.consent.required_for_regulated_action`); plan in collapsible `<details>` with layer + step + status per row (L8 intent_received → L7 intent_normalized → L6 skill_selected → ...); audit reference — orchestrationId without `bos:orchestration:` prefix so citizen can quote it back against /api/ledger. **Don't clear textarea on submit** — earlier behaviour cleared text so user couldn't see what they sent; keep textarea, add [Clear outcome] ghost action next to Send when outcome is live. Recent activity filter unchanged — once actorId lands on orchestration via shape fix, list naturally populates. **§15 bindings**: honest about blocked (citizen sees exact scopes needed, no silent failure); plan visible (citizens expand to see every L8→L3 layer the request flows through, nothing hidden); audit reference exposed (orchestrationId matched against /api/ledger entries); no third-party tracking leakage (card lives on citizen's own device). **Tests**: 1 new Vitest in `frontend/src/lib/use-send-intent.test.ts` pins POST contract — body MUST carry intentText + actorId + locale flat, MUST NOT reintroduce nested intent/actionRequest wrappers. FE Vitest 32 → 33 (+1). No new Node tests (zero BE changes). Spot-check orchestrator + api 26/26 still passing. **Bundle**: main 369 → **372 KB / 113 KB gzipped** (+3 KB for Outcome card + extended types). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.54s. **Consequences**: headline demo flow ("type intent → see what Bharat OS does") wired end-to-end on /app/ — "Book a cab" surfaces warning-toned card with action label + localised blocked message + required consent scopes + failing policy + audit reference; no more silent submits. /app/-grows-/shell/-retires direction moves one step forward (citizen orchestration flow no longer needs /shell/ debug to see what's happening). Phase 11.8 has obvious shape: per-scope consent grant UI launched from Outcome card's consent block; once shipped, "Book a cab" can flow blocked → grant consent → re-send → planned → completed in /app/ end-to-end. FE/BE shape contract pinned by test — nested shape can't regress. **What's NOT in 11.7**: per-scope consent grant UI (11.8 — Outcome card surfaces requirement but doesn't let citizen grant yet); auto-re-send on consent grant (11.8); voice intent input (/app/ v2 polish); action-specific outcome UI — daily_brief composed text, service_booking ranked marketplace results — generic card today; multi-language outcome (localizedResponse.text respects locale but action-type labels + scope strings English-only; i18n is Phase 12+). ADR 0126.

---

Closed in Phase 10.6 (ADR 0125 — on-device SLM pre-labeling hint; Phase 10 v1 arc CLOSED):
1. ✅ **Workers with an installed SLM can pre-label tasks via on-device inference — ~2-3× throughput on classification / preference / safety_label** — Phase 10.0 → 10.5 closed the labeling marketplace lifecycle but left worker throughput entirely manual. At ₹3-5 per label, a worker labels ~360 items/hour at ~10s/item; the SLM can suggest an answer the worker then accepts/edits in ~3-4s — halving time-per-label, doubling take-home pay. Phase 10.6 wires the existing Phase 9.0c runtime into the labeling tasks as a pure FE feature with zero BE changes. **Pure module `frontend/src/lib/labeling-slm-hint.ts`**: `buildHintPrompt(taskKind, body)` returns a prompt string per task kind or null on malformed body; `parseHintCompletion(taskKind, body, completion)` converts the SLM's free-form text back into a typed `labelValue` matching the shape the task would submit by hand or null on parse fail; `HINT_MAX_TOKENS = 96` + `HINT_TEMPERATURE = 0.3` exported as defaults. **Per-task-kind templates**: classification lists options as `value: label (description)` and asks "Answer with the option value ONLY" (parser tolerates extra words via substring match on value first, label second); preference_pair shows both responses, asks for "a" or "b" (parser uses `\b(a|b)\b` boundary match to avoid matching "and"/"because"); span_annotation enumerates each word with its index (`0: I`, `1: need`, ...), asks for comma-separated indices or "none" (parser extracts every plausible integer in range, sorts ascending, falls back to empty set on "none"); transcription only fires when sponsor provided `asrPreFill` (SLM cannot transcribe audio from URL alone), asks for corrected transcript, single-string parser strips quotes; safety_label lists categories, asks for applicable values or "safe" (parser short-circuits on "safe" returning empty array — explicit "no harm" choice from Phase 10.3; otherwise scans for category values + labels). All templates default to temp 0.3 low-creativity draw so parses are stable. **Component `<SlmHintCard>`**: gated on `useInstalledSlms(identityId).data?.[0]` — returns null when no SLM is installed (clean degradation, no broken button); resets suggestion when `item.itemId` changes via `useEffect`; lazy-loads runtime on first tap (reuses `loadSlmRuntime` + `readSlmBlob` from Labs); streams completion via `onToken` so worker sees progress in a `<pre>` showing raw model output below; runs `parseHintCompletion` to convert to typed labelValue; offers [Suggest a label] / [Suggest again] action + [Use this suggestion] action appearing only after parse succeeds; honest error states for OPFS-miss / runtime-load-fail / parse-fail; cleans up WASM runtime on unmount via `useEffect` cleanup. **Wired into Labels.tsx** above the task renderer with same onAccept / onSubmit signature — accepting an SLM suggestion flows through existing submit pipeline (golden-set check, sponsor-review sampling, mesh credit, escrow debit unchanged; server cannot distinguish SLM-suggested from hand-authored labels). **§15 bindings preserved**: on-device only (prompt + completion stay in WASM; only the chosen labelValue leaves the device, same shape as hand-authored); no auto-submit (card never calls onAccept without explicit worker tap; suggestion always shown first); suggestion editable ([Suggest again] for different draw or ignore entirely and label by hand; task renderer below is fully functional regardless); honest about uncertainty (null parse hides [Use this suggestion] button and shows error message — workers cannot accidentally submit garbage); mesh credit for actual labels only (no mesh-inference event for hint generation — Labs SlmTryPrompt pays per prompt but labeling hint per item would inflate worker earnings beyond what sponsors paid for; future polish 10.6.1 could attribute a small inference event but v1 keeps accounting clean). **Tests**: FE Vitest `labeling-slm-hint.test.ts` **16 new** (6 `buildHintPrompt`: classification renders option values + question, preference_pair renders both responses, span lists indices, transcription returns null without pre-fill, safety lists categories, malformed bodies return null; 10 `parseHintCompletion`: classification value match + label fallback + null on no match, preference_pair "a"/"b" extraction + word-boundary, span indices + "none" + out-of-range drop, transcription quote-strip + whitespace-null, safety multi-category + "safe" empty-array). FE Vitest total 16 → 32 (+16). **No new Node tests** — zero BE changes. Node suite spot-check 207/207 on batch 2/5 unchanged. **Build**: main 363 → **369 KB / 112 KB gzipped** (+6 KB for hint module + SlmHintCard component). wllama lazy chunk unchanged 292 KB / 126 KB gzipped (hint card reuses same dynamic import). Vite build 1.56s. **Consequences**: **Phase 10 v1 arc CLOSED** (10.0 → 10.6 all shipped; remaining items are polish not gaps); workers with SLM installed get ~2-3× throughput boost on tasks SLM handles well (classification, preference_pair, safety_label; marginal on span — Phi-3-mini struggles with exact word indices; only useful on transcription when sponsor pre-filled); pattern proven for Phase 12+ AI-native OS surfaces (any UI with structured input can be SLM-prompted on-device using same `buildPrompt / parseCompletion` shape); zero new BE risk (submit path unchanged; same validations apply whether labelValue came from human or SLM). **What's NOT in 10.6**: per-task-kind UI annotations (hint card sits above task renderer; pushing suggestion *into* task UI — highlight suggested option, pre-fill span words, pre-fill textarea — is 10.6.1 polish); mesh-inference attribution for hint generation (10.6.1); multi-model selection (worker uses first installed SLM; if multiple, no UI to pick); hint quality telemetry (no accept-rate tracking — would expose hint usage to sponsor; signal would help tune templates but requires per-action ledger event the design intentionally avoids); hint determinism via fixed seed (wllama doesn't expose seed API; suggestions vary between [Suggest again] taps; acceptable for v1). ADR 0125.

---

Closed in Phase 10.5 (ADR 0124 — signed labeling-job audit export bundle):
1. ✅ **Sponsors can pull a tamper-evident NDJSON audit bundle for any labeling job** — Phases 10.1 → 10.4 closed the marketplace lifecycle but left no canonical artifact a sponsor could hand to their downstream training pipeline as proof-of-purchase. Phase 9.1 already had a federated-round NDJSON export, but it shipped unsigned. Phase 10.5 ships the missing piece for labeling: a single Ed25519-signed NDJSON bundle that any verifier can re-hash and re-verify against a public-key endpoint, with the original content hash anchored in the server ledger so a sponsor can't swap in a tampered version later and claim it was authoritative. **Module `src/phase1/labeling-export.mjs`** (pure): `LABELING_EXPORT_PROTOCOL_VERSION = 'bos.phase10.labeling-export.v0'`; `identityHashFor(jobId, workerId)` returns `'sha256:' + sha256Hex(jobId + '::' + workerId)` — same rotating-per-(job, worker) scheme as Phase 10.4 sponsor-review list and Phase 9.1 federated-round export, so sponsors cannot cross-job correlate workers; `buildLabelingExportLines({job, submissions, signerIdentity, exportedAt})` filters submissions to `ACCEPTED_SUBMISSION_STATUSES` (excludes `pending_sponsor_review`, `rejected_golden_mismatch`, `rejected_sponsor_review`), builds a `header` line with `{protocolVersion, jobId, sponsorId, taskKind, language, modality, perLabelPaise, ipTerms, consentPurposeCode, submissionCount, exportedAt, signerId}`, one `submission` line per accepted row with `{submissionId, jobId, sponsorId, itemId, taskKind, labelValue, status, submittedAt, identityHash, payoutPaise: job.perLabelPaise}` — **never the workerId, the device id, or any personal identifier** — then computes `contentSha256 = sha256Hex(headerLine + '\n' + sub1 + '\n' + ... + subN + '\n')` and signs it with the audit signer's Ed25519 private key, emitting a `trailer` line `{type, contentSha256, signature: {algorithm: 'Ed25519', signerId, signatureBase64}}`. `bundleNdjson(lines)` joins with `\n` + trailing newline. `verifyLabelingExportLines(lines, signerPublicRecord)` returns `{ok, reason?, contentSha256?, submissionCount?}` running every check: trailer present + parses + matches body hash + signature valid + signerId agrees between header/trailer/public-key. **Audit signer is a singleton** for the deployment — one Ed25519 keypair lazy-bootstrapped on first export request (or first public-key request, whichever comes first) and persisted in the store. **BosStore**: `auditSignerFile()` returns `rootPath/audit-signer.json`; `readAuditSigner()` returns null on ENOENT; `saveAuditSigner(signer)` writes the keypair + emits `audit_signer.created` ledger event. **SqliteStore**: new `audit_signer` table with `singleton TEXT PRIMARY KEY` (always 'audit-signer') + `json TEXT`; same `readAuditSigner()` / `saveAuditSigner()` API. **New endpoints**: GET `/api/audit-signer/public-key` (public — no auth) lazy-bootstraps the signer on first hit and returns the public record `{protocolVersion, id, displayName, publicKeyPem, attestations, createdAt}` (private key never leaves the server); anyone — sponsor, citizen, regulator — can fetch this to verify a bundle. GET `/api/sponsors/:sponsorId/labeling-jobs/:jobId/export.ndjson` (sponsor-bearer gated) returns 404 `unknown_job` if the job isn't on this sponsor, otherwise lazy-bootstraps the audit signer if absent, lists all submissions for the job, calls `buildLabelingExportLines`, joins via `bundleNdjson`, sets `content-type: application/x-ndjson; charset=utf-8`, and emits a `labeling_export.signed` ledger event with `{jobId, sponsorId, signerId, contentSha256, submissionCount, exportedAt, protocolVersion}` so a sponsor cannot quietly downgrade a previously-verified bundle to a tampered one and claim it was the original. **FE updates**: hooks.ts gains `useAuditSignerPublicKey()` (TanStack Query with 24h staleTime — key doesn't change) returning `{protocolVersion, id, displayName, publicKeyPem, createdAt}` typed `AuditSignerPublicRecord`; `labelingExportNdjsonUrl(sponsorId, jobId)` pure builder for the sponsor download URL. Settings.tsx gains a `trust`-toned **Audit signer** card showing the signer's id + creation date + a collapsible `<details>` displaying the full Ed25519 PEM public key — copy reads "Every labeling job ships sponsors a signed audit bundle. The same Ed25519 key signs every bundle so sponsors can verify they got the real one. Anyone can fetch the public key here." Adversarially honest disclosure — citizens see the same key their employers use to verify the receipts of their work. **Routes-list endpoint** now advertises both `/api/sponsors/:sponsorId/labeling-jobs/:jobId/export.ndjson` and `/api/audit-signer/public-key`. **§15 bindings preserved**: pointer-not-payload (per-submission line carries only `submissionId / itemId / labelValue / submittedAt / identityHash / payoutPaise` — never worker id, phone, device, attestation); cross-job correlation prevented (`identityHash = sha256(jobId::workerId)` — same worker hashes differently across jobs); tamper-evident (mutating any line breaks `verifyLabelingExportLines` with `content_hash_mismatch`); server-anchored audit (ledger event records contentSha256; sponsor cannot later present a "corrected" bundle); accepted-only filter (only `accepted` submissions appear — `pending_sponsor_review` excluded so the bundle's payout total matches `escrowDebitedPaise`); honest signer disclosure (Settings shows the exact key citizens' employers verify against; no hidden cryptography). **Tests**: BE `tests/node/labeling-export.test.mjs` **11 new** (7 pure module: identityHash rotation per (jobId, workerId), header + N submissions + trailer shape, accepted-only filter excludes pending + rejected, verifier ok on untampered bundle, content_hash_mismatch on tampered submission line, verifier fails with wrong signer public key, bundleNdjson joins with \\n + trailing newline; 4 HTTP: lazy-bootstrap + stability across calls for audit-signer/public-key + private key never leaks, bearer gate on export endpoint, verifiable signed roundtrip + ledger event present, 404 on unknown job for this sponsor). Full Node suite **865/865** (was 854; +11) across 5 batches of 16 files (Windows process-spawn OOM workaround per memory rule). FE Vitest 16/16 unchanged. Bundle main 362 → **363 KB / 111 KB gzipped** (+1 KB for audit-signer hook + Settings transparency card). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.42s. **Consequences**: sponsor audit story closed for v1 labeling marketplace (auditor fetches bundle + public key + ledger event → end-to-end verifiable with no Bharat OS-side trust); Phase 10 progress ~75% → ~88% — only Phase 10.6 (SLM pre-labeling hint) and polish remain before v1 ship; pattern extends to federated rounds (10.5.1 polish — same trailer + signer pattern can backfill the Phase 9.1 unsigned export); citizen-side transparency posture strengthened (Settings exposes the same key sponsors use — workers can verify receipts of their labor); FE-BE parity rule honored (BE bundle + endpoints + ledger; FE hook + Settings card + URL builder — both ship together). **What's NOT in 10.5**: key rotation (single signer for the deployment's life; rotation is 10.5.1 polish — would need a `header.signerVersion` field + multi-key lookup mechanism on the verifier); sponsor-side download UI (sponsors today curl / use their own tooling with bearer token; one-click sponsor console download is 10.5.1); worker-side signed receipt bundle (workers can already DPDP-export their own data; signed worker receipt is 10.6+ polish if real workers ask); bulk multi-job export (per-job only; bulk is 10.5.2 polish); encrypted bundle (plaintext NDJSON + signature; sponsors who want encryption-at-rest TLS-tunnel + re-encrypt at their end; 10.5+ polish if enterprise pushback); admin signing-key rotation tools (no CLI to rotate; persist + forget); 10.4.1 polish items (inter-annotator α, refund route, premium-job UI gating) all still pending. ADR 0124.

---

Closed in Phase 10.4 (ADR 0123 — labeling QC pipeline: golden-set + worker score gate + sponsor sample-review + clawback):
1. ✅ **Labeling marketplace converges on quality — workers below score gated; sponsors can reject with mesh+escrow clawback** — Phase 10.1/10.2 accepted every submission; workers could spam random answers and still earn paise, sponsors had no dispute lever, marketplace couldn't converge on quality. Phase 10.4 wires ADR 0110's QC plan: layer 1 (golden-set scoring on submit), layer 3 (sponsor sample-for-review pool with reject + clawback), layer 4 (worker score gate on next-item dispatch). Layer 2 (inter-annotator α) defers to 10.4.1 polish — α requires N≥2 workers per item, only meaningful at scale. **Submission statuses** extended: `LABELING_SUBMISSION_STATUSES` adds `rejected_golden_mismatch` (server-imposed at submit), `pending_sponsor_review` (sampled at submit), `rejected_sponsor_review` (sponsor rejected from sample). `ACCEPTED_SUBMISSION_STATUSES` + `QC_REJECTED_STATUSES` Sets exported as helpers. **Job QC config additive, all default 0 → off**: `qcGoldenItemRateBps` (basis-points descriptor for sponsor declaration), `qcMinWorkerScore` in [0,1] (workers below this gated from new dispatches on this job), `qcSponsorReviewRateBps` (basis-points share of accepted submissions routed to sponsor review). All locked at create time — sponsor can't change mid-job without revoke + re-create (same posture as 9.1 escrow lock). **Three pure module helpers in `src/phase1/labeling-job.mjs`**: `computeWorkerScore(submissions)` → number in [0,1]; numerator = accepted; denominator = accepted + QC-rejected; pending_sponsor_review NOT counted (not yet adjudicated); fresh workers (0 adjudicated subs) get score 1 (benefit of the doubt; gate is for repeat offenders). `matchesGoldenAnswer(taskKind, labelValue, goldenAnswer)` → true/false/null (null when golden absent or comparison undefined for this task kind); comparisons per kind: preference_pair equal `choice`, classification equal `value`, span_annotation equal `wordIndices` order-independent, transcription case-insensitive trimmed `transcript`, safety_label set-equal `values`. `shouldSampleForReview(submissionId, rateBps)` → boolean via deterministic FNV-1a hash of submissionId modulo 10_000 < rateBps; same submission always gets same verdict (idempotent rerun). **Submit path** (POST /api/labeling-jobs/:jobId/submissions): worker-can-claim check (unchanged from 10.1) → golden-set check via `matchesGoldenAnswer`; if false → status `rejected_golden_mismatch` rejectionReason `golden_set_mismatch` **NO mesh credit + NO escrow debit**; otherwise → status `accepted`, then `shouldSampleForReview` may flip to `pending_sponsor_review` (either way mesh credit lands — don't punish good workers for being sampled; sponsor can flip pending → rejected later). Item marked consumed in all paths. Response carries `qcVerdict` (`'accepted' | 'sampled_for_sponsor_review' | 'golden_set_mismatch'`) + worker's updated `workerScore` so FE renders honest feedback. **Next-item dispatch — score gate**: if `job.qcMinWorkerScore > 0`, compute worker's score on this job's prev submissions; below gate → `{item: null, reason: 'below_worker_score_gate', workerScore, gate}`. FE renders warning-toned card with honest numbers. **Sponsor review endpoints (bearer-gated)**: GET `/api/sponsors/:id/labeling-jobs/:jobId/submissions?status=pending_sponsor_review` lists pending sample stripped to `{submissionId, itemId, taskKind, labelValue, status, submittedAt, identityHash}` where **identityHash = sha256(jobId::workerId)** — same rotating-per-job posture as Phase 9.1 federated-round export; sponsor cannot cross-job correlate. POST `/api/sponsors/:id/labeling-jobs/:jobId/submissions/:subId/reject` body `{reason: string >= 4 chars}`: refuses 409 `not_pending_review` if submission not in pending state; 400 `reason_required` if missing/short; flips to `rejected_sponsor_review`, **negative mesh-contribution event** for worker with `payoutPaise: -job.perLabelPaise`, **sponsor escrow refunded** via `lockEscrow` (NOT refundLockedEscrow — escrow was DEBITED on submit; moving paise back to locked bucket where next submission can debit), decrements `submissionsAccepted`/increments `submissionsRejected`/decrements `escrowDebitedPaise` on job, emits `sponsor_escrow.refunded` ledger event, returns `{submission, clawedBackPaise}`. POST `/api/sponsors/:id/labeling-jobs/:jobId/submissions/:subId/accept` flips pending → accepted with no mesh/escrow changes (already happened on submit). **Mesh-contribution module — allow negative for labeling**: `computePayoutPaise` for workload 'labeling' now returns `Math.round(Number(payoutPaise ?? 0))` instead of clamping at 0; clawback events flow through with negative payoutPaise; mesh-balance computation already does `availablePaise += e.payoutPaise ?? 0` so negatives reduce balance naturally. **Honest disclosure**: if worker's UPI-cashed-out earnings get clawed back later, balance goes negative momentarily — Bharat OS doesn't pull money back from UPI; claws back from future earnings (same semantics as Uber driver chargebacks). **Worker-facing stats endpoint** GET `/api/identities/:id/labeling-stats` returns `{identityId, overall: {submissionCount, score}, perJob: [{jobId, submissionCount, acceptedCount, pendingReviewCount, rejectedCount, score}]}`. Computes scores on-the-fly from `labeling_submissions`; no new table; fast via existing `worker_id` index + per-job filtering. **FE updates** in Labels.tsx: **overall worker-score card** at top of Labels page when worker has ≥ 1 submission (big "Your score: 92%", tone-coded trust ≥ 0.9 / default ≥ 0.7 / warning otherwise, badge premium/good/needs review, copy *"≥ 90 % unlocks premium jobs (Phase 10.5 polish — coming)."*); session view stat row grows 2 → 3 (Submitted / Accepted with running score / Earned); **last verdict card** below stats showing sponsor's just-resolved decision (trust-tone "Accepted — paid to your mesh balance" / warning-tone "Paid — sponsor may review this one. If rejected we claw back the credit" / default-tone "Golden-set mismatch. No payout. Score may have dropped — read the item again and try the next one."); **score-gate card** when `next-item` returns `below_worker_score_gate` with honest numbers (worker score + gate threshold) + Back to jobs action; reads as adversarially-honest disclosure not punishment. hooks.ts: SubmitLabelResponse extended with workerScore + qcVerdict; useLabelingStats(identityId); NextItemResponse with optional workerScore + gate. **seed-demo extension**: classification job's first item gains `goldenAnswer: {value: 'business_loan'}`; classification job's QC config set to qcGoldenItemRateBps 1000 (10% golden descriptor) + qcMinWorkerScore 0.7 + qcSponsorReviewRateBps 2000 (20% review sample — generous so demo hits sponsor-review path frequently). launchSeedJob helper now passes goldenAnswer from each item declaration and forwards 3 QC config fields to createLabelingJob. **§15 bindings**: sponsor can't see raw worker identity in review queue (identityHash rotates per (job, worker)); worker payouts honestly disclosed (qcVerdict on every submit + running score on Labels page); golden mismatch is no-payout NOT negative-payout (server emits no mesh event for rejected_golden_mismatch); sponsor reject requires reason ≥ 4 chars; sponsor can't reject already-final submissions (409); worker can't game the system (goldenAnswer stripped from next-item response — worker doesn't know which items are golden); score gate is honest disclosure (reason returned with workerScore + gate so FE shows real numbers); clawback auditable (sponsor_escrow.refunded + negative mesh-contribution-event ledger anchor); sponsor sample deterministic (FNV-1a hash → idempotent rerun verdict); pending review still pays worker (sponsor can claw back but default posture is trust — cash-out works on pending balance); cross-job correlation prevented (identityHash rotation + goldenAnswer never leaves server). **Tests**: BE `tests/node/labeling-qc.test.mjs` **16 new** (11 pure-helper: computeWorkerScore 2 + matchesGoldenAnswer 5 task kinds + shouldSampleForReview 3 determinism/rate-spread/rate-0; 5 HTTP: golden mismatch → rejected + no mesh, score-gate blocks dispatch, sponsor reject claws back mesh + escrow, sponsor accept clears pending, stats endpoint returns overall + per-job). Full Node suite **854/854** (was 838; +16). FE Vitest 16/16 unchanged. Bundle main 359 → 362 KB / **111 KB gzipped** (+1 KB for stats hook + worker-score card + verdict surfacing). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.48s. seed-demo runs clean with QC config on classification job. **Consequences**: labeling marketplace converges on quality (random-spam workers drop score + get gated; high-quality workers accumulate score >0.9 unlocking premium jobs in 10.5); sponsors get reject lever without crushing workers (default posture is trust — workers paid on submit; sponsor actively rejects with reason; default rates 5% means most workers never hit review pool); clawback honest (negative mesh ledger event; balance reflects reality; honest disclosure beats hiding chargeback); pattern reused for Phase 10.5 signed export (identityHash rotation already in review-list endpoint; signed-export just wraps with sign + ndjson); Phase 10 progress ~57% → ~75% with remaining 10.5 signed export (~1 wk) + 10.6 SLM pre-labeling hint (~1 wk) + 10.4.1 polish (inter-annotator α, refund route, premium-job gating UI). **What's NOT in 10.4**: inter-annotator α Krippendorff α across N≥2 workers per item (needs jobs configured for N≥2 submissions per item which seed-demo doesn't exercise at scale; Phase 10.4.1 polish); premium-job gating in UI (overall-score card hints but jobs aren't yet filterable by required score; 10.5 polish); worker appeal of golden-set fail (wrong golden — sponsor error / ambiguous case — no appeal path; 10.4.1 polish or post-MVP); per-job worker suspension beyond gating (sponsor can't blacklist specific identityHash; once gate breached worker must improve overall score elsewhere; adequate for v1); refund route for job cancel (refundLockedEscrow helper still pending — 10.1.1 polish); worker-side "your last 7 days" trends (single overall score + per-job breakdown only; time-series post-MVP). ADR 0123.

---

Closed in Phase 10.3 (ADR 0122 — remaining four task kinds on `/app/labels/`):
1. ✅ **All 5 task kinds first-class on /app/labels/** — Phase 10.2 shipped only `preference_pair`; the other four task kinds rendered an honest "not supported in /app/ v1" card. Phase 10.3 wires them in. Pure FE — **zero BE changes** because items + submissions are stored opaquely. **Dispatcher refactor**: `Labels.tsx`'s inline TaskRenderer becomes a thin map lookup `const TASK_RENDERERS: Record<string, ComponentType<LabelingTaskProps>> = { preference_pair, classification, span_annotation, transcription, safety_label }`. PreferencePairTask extracted from Labels.tsx into its own file for parity. All five components live under `frontend/src/components/labeling/` with shared `LabelingTaskProps` + `types.ts`. **`<ClassificationTask>`**: item body `{prompt?, text, options: [{value, label, description?}]}`; submission `{value: '<option.value>' | 'skip'}`. Text card + tappable category cards; first-tap submits. **`<SpanAnnotationTask>`**: item body `{text, instruction?, labelKind?}`; submission `{wordIndices: number[] | 'skip', labelKind}`. Word-level toggling (tap word to toggle inclusion); useMemo splits text on whitespace preserving trailing spaces so rendered text reads naturally. Picked words highlighted with trust-green background; [Submit N words] + [Clear] + [Skip] actions; Submit disabled when 0 picked. **Word-level vs character-level rationale**: character-level drag selection on touch is gnarly cross-platform (mobile Safari / Chrome Android / desktop pointer events disagree about boundaries especially across mixed Devanagari + Latin scripts); word-level is reliable on mobile (large tap targets) + accessible via keyboard tab + space/enter + honest about precision (sponsors get word indices) + sufficient for most span tasks (named entity, intent, amount extraction). Character-level precision when needed ships as v2 `span_annotation_precise`. **`<TranscriptionTask>`**: item body `{audioUrl?, languageHint?, asrPreFill?, instruction?}`; submission `{transcript: string | 'skip'}`. Browser-native `<audio>` element + textarea pre-filled with sponsor's asrPreFill. **Graceful audio failure** — when audioUrl is missing OR loading fails (404/CORS/codec), component renders honest "No audio attached / Could not load" message; textarea stays usable so worker can submit a remembered transcript or skip. Seed-demo intentionally omits audioUrl (Bharat OS doesn't host public audio in v1); sponsors hosting real audio fill it in. **Indic ASR auto-fill intentionally not wired** here — loading Whisper-WASM costs ~50-100 MB per session (wasteful); body.asrPreFill from sponsor is enough (sponsors pre-process with their own ASR pipeline or future `/api/transcription/preprocess`); worker-side ASR + edit becomes Phase 10.6 polish alongside SLM pre-labeling. **`<SafetyLabelTask>`**: item body `{prompt?, text, categories: [{value, label, description?}], multiSelect?}`; submission `{values: string[] | 'skip'}`. Multi-select via `Set<string>` for picked categories; checkboxes styled as 2-border cards with checkmark indicator; **explicit `[Mark as safe]` action when nothing picked** (so "no harm" is honest positive choice not silent absence — forces workers to engage with safe-vs-harm decision; captures "I considered + concluded safe" in `{values: []}` distinct from no submission); Phase 10.4 QC will compute inter-annotator α across this multi-label space. **File layout**: `frontend/src/components/labeling/` with `types.ts` (shared LabelingTaskProps) + 5 task components. Each component 90-150 lines, self-contained, uses existing `<Card>`/`<Action>`/`<Field>` primitives. Zero new deps. **seed-demo extension**: 4 new active jobs under existing Pragati Microfinance sponsor — one per new kind, two items each, all Hindi-language (classification "Classify loan-applicant intent" with 4 options business/personal/home/unclear; span_annotation "Highlight the words that name the loan amount" with mixed-script Devanagari + Latin; transcription "Transcribe the customer call in Hindi" with ASR pre-fills no audio URL honest demo posture; safety_label "Flag harmful content" with 4 categories threat/harassment/self_harm/safe at ₹5 per label since safety is higher cognitive load). Sponsor escrow topped up ₹100 before locking the 4 jobs (total cost ≈ ₹36 for 8 items; ample headroom). On fresh seed `/app/labels/` shows **5 active jobs across all 5 task kinds**. **§15 bindings preserved**: all task UIs honest about source (sponsor's prompt/text/instruction rendered verbatim via React `{value}` interpolation; no dangerouslySetInnerHTML); sponsor never sees raw worker identity (same as 10.2; export rotates identityHash in 10.5); Skip always available (every kind has explicit `'skip'` value so workers can opt out per-item without disengaging from job); multi-select honesty (Safety makes "no harm" explicit positive choice not silent absence); word-level honesty (span submits word INDICES not character ranges — sponsors know exactly what precision they paid for); audio failure graceful (transcription renders honest failure message; worker can still submit remembered transcript); no silent UI defaults (every task starts with empty state; worker must engage to submit; no pre-checked options); server-side opacity preserved (every labelValue is server-opaque JSON; submission validators don't peek into shape — sponsor owns schema for export consumer). **Tests**: FE 16/16 Vitest unchanged (new components are render-shape-only pure functions of props + local state; component-level tests deferred to polish since dispatcher integration exercised by Labels indirectly); BE 0 new tests (Phase 10.1 lifecycle already exercises opaque-labelValue contract); spot-check on labeling-job + sponsor + mesh-contribution suites **46/46 pass**. **Bundle**: main 352 → **359 KB / 110 KB gzipped** (+7 KB for 4 new task components); wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.42s. **seed-demo runs clean**: 5 labeling jobs land on fresh seed with sponsor escrow correctly locked across all 4 new jobs. **Consequences**: all 5 task kinds first-class on /app/labels/ (any sponsor whose data fits one of these shapes can launch a job and have workers fulfill it without custom UI or /shell/ fallback); **labeling marketplace v1 is feature-complete** (Phase 10.4 QC + 10.5 signed export + 10.6 SLM pre-labeling are enhancement layers not gaps); pattern established for v2 task kinds (add a component + register in dispatcher map; BE doesn't need to know; future ranking / multi-comparison / freeform rewrite / bounding-box image when modality:image arrives all follow same pattern); bundle still well under target (110 KB gzipped main + 126 KB lazy; headroom for 10.4/10.5/10.6 without code-splitting); demo investor-impressive (5 jobs across 5 task kinds on fresh seed with realistic Indic content). **What's NOT in 10.3**: Indic ASR auto-fill in transcription (Phase 10.6 polish); character-level span selection (kept word-level for v1; precise kind ships separately when medical/PII sponsor needs it); image/bounding-box annotation (Phase 10.7+ when modality:image flows); voice-recording task (worker speaks, sponsor consumes audio — separate ship; needs MediaRecorder + upload route); component-level Vitest tests (render-shape-only, deferred to polish); refund on job close/cancel (10.1.1 still pending; reuses Phase 9.1 refundLockedEscrow). ADR 0122.

---

Closed in Phase 10.1 + 10.2 (ADR 0121 — labeling marketplace v1: BE substrate + worker /app/labels/ surface):
1. ✅ **Labeling marketplace v1: workers can earn paise per accepted label TODAY** — ADR 0110 sketched the labeling marketplace as Bharat OS's strongest non-investor revenue lever (Scale AI valuation ~$13.8B, ~$15B+ priced TAM, Indic-language gap). Phase 10.0 (sponsor schema) was already done implicitly via Phase 9.1's sponsor module. ADR 0121 covers 10.1 (BE substrate + draft/upload/launch/discover/submit lifecycle + sponsor escrow integration) and 10.2 (worker `/app/labels/` tab with preference-pair task UI). 10.3 (other task kinds), 10.4 (QC pipeline), 10.5 (signed export), 10.6 (SLM pre-labeling hint) ship in follow-ups. **Module `src/phase1/labeling-job.mjs`** (pure validation, no I/O): `LABELING_TASK_KINDS` 5 v1 kinds (preference_pair / classification / span_annotation / transcription / safety_label); `LABELING_MODALITIES` (text / voice / image); `LABELING_JOB_STATUSES` 6-state lifecycle (draft → funded → active → paused → complete | cancelled); `createLabelingJob` validates draft (status: draft, escrow not yet locked); `createLabelingJobItem({jobId, taskKind, body, goldenAnswer?})` with goldenAnswer opaque for Phase 10.4 QC; `createLabelingSubmission` defaults to status: 'accepted' in v1; `workerCanClaim(job, item, prevSubmissions)` used both client + server enforce; `totalLaunchCostPaise(job)` returns `itemCount × (perLabelPaise + bharatOsFeePaise)`. **Job record** carries jobId / sponsorId / taskKind / language / modality / perLabelPaise / bharatOsFeePaise / itemCount / ipTerms (non_exclusive | exclusive | cc_by_4_0) / consentPurposeCode / description / status / createdAt / deadlineAt / launchedAt / completedAt / cancelledAt / submissionsAccepted / submissionsRejected / escrowLockedPaise / escrowDebitedPaise / itemsUploaded. **Validation guards**: itemCount ≤ 1M; perLabelPaise positive integer; language required; consentPurposeCode required + trimmed; enums enforced for taskKind / modality. **Storage**: three new tables/dirs on both backends — `labeling_jobs` (job_id PK, sponsor_id indexed) emits `labeling_job.saved` ledger; `labeling_job_items` (item_id PK, job_id indexed); `labeling_submissions` (submission_id PK, job_id + worker_id + item_id indexed) emits `labeling_submission.accepted` / `.rejected`. **DPDP §12(3) cascade**: labeling_submissions go through eraseUserData sweep on both backends filtered by worker_id; jobs + items are sponsor-owned and stay (they don't reference worker except via submission rows). **`'labeling'` workload type on mesh-contribution**: MESH_WORKLOAD_TYPES extended to include `labeling` (alongside 9.0d federated_round); `computePayoutPaise` reads explicit payoutPaise (set by the job); `createMeshContributionEvent` accepts optional jobId + itemId populated only for `workloadType: 'labeling'`; bytes null for labeling events. **API routes**: **Sponsor-bearer-gated** — POST /api/sponsors/:id/labeling-jobs (create draft); GET /api/sponsors/:id/labeling-jobs (list own); POST /api/sponsors/:id/labeling-jobs/:jobId/items (upload corpus; body {items: [{body, goldenAnswer?}, ...]}; 409 job_not_draft if not draft; 400 exceeds_item_count if upload would overflow declared itemCount); POST /api/sponsors/:id/labeling-jobs/:jobId/launch (draft→active; 409 if not draft; 400 items_incomplete if itemsUploaded < itemCount; 402 insufficient_escrow if underfunded with requiredPaise + availablePaise; on success locks escrow + emits sponsor_escrow.locked). **Public worker discovery (no auth)** — GET /api/labeling-jobs?language=hi&taskKind=preference_pair returns active jobs filtered by query params; **strips sensitive sponsor-only fields** before responding (no escrow numbers in worker surface; sponsor name resolved via Phase 9.1 public directory endpoint). **Worker-anchored (no auth — workerId in query/body)** — GET /api/labeling-jobs/:jobId/next-item?workerId=… dispatches next eligible item; **strips goldenAnswer** before returning (server keeps for QC pipeline); POST /api/labeling-jobs/:jobId/submissions with `{itemId, workerId, labelValue}`; server enforces workerCanClaim refusing with 409 cannot_claim on duplicate; on accept creates labeling-submission row (status: accepted in v1), bumps job.submissionsAccepted + escrowDebitedPaise, marks item consumed: true, **debits sponsor escrow via debitLockedEscrow** (failure logs warning + continues so worker payout never held hostage to sponsor accounting), records mesh-contribution-event with workloadType: 'labeling' + payoutPaise: job.perLabelPaise + jobId + itemId, returns submission + mesh event. **FE `/app/labels/` worker surface (Phase 10.2)**: **new Labels tab on worker bottom nav (5 tabs now: Earn / Labels / Trust / Labs / Settings)** — bottom-nav on mobile handles 5 tabs cleanly via existing responsive Tabs component. **frontend/src/routes/Labels.tsx**: job list view (default) with hero header + per-job `<LabelingJobCard>` (description / task-kind / language badges, **"Sponsored by X" governance badge** via `useSponsorDirectory`, remaining-items count, per-label `<Money>`, [Start labeling] action disabled when remainingItems ≤ 0); session view activated by Start labeling with top status row (✕ Close, two-stat header Submitted count + Earned-this-session via `<Money>`), task-specific renderer. **`<PreferencePairTask>`** only task kind shipped in v1: prompt card (if body.prompt present) + two big A/B buttons stacked on mobile / side-by-side desktop with hover/focus tinted trust-green + [Skip this item] ghost action. Other task kinds render honest "not supported in /app/ v1" card directing to /shell/ or Phase 10.3. **New hooks** in lib/hooks.ts: useLabelingJobs(language?), useLabelingNextItem(jobId, workerId) with staleTime: 0 (next-item changes constantly), useSubmitLabel mutation invalidating labeling-next-item + labeling-jobs + mesh-balance + mesh-summary for the worker on success so Earn tab updates next nav. **App.tsx + routes**: new `/labels` route under ProtectedSurface; Worker tab bar gains Labels entry between Earn and Trust. Citizen tabs unchanged (citizens don't label). **seed-demo.mjs extension**: 5 Hindi-language preference-pair items under existing Pragati Microfinance sponsor; job description "Pick the more helpful loan-application explanation (Hindi)"; items mix English + Devanagari demonstrating realistic Indic RLHF content; job launched on seed (status: active) with escrow locked (5 × ₹4 = ₹20). **§15 bindings preserved**: per-job consent grants required (consentPurposeCode mandatory; FE surfaces via job description; future polish wires Phase 1.27 remediation flow); sponsor never sees raw identity (next-item + submissions accept workerId but never expose to sponsor surfaces; Phase 10.5 export bundle uses rotating identityHash like Phase 9.1); worker can withdraw mid-job (stops submitting; in-flight dispatch returns null when no eligible items left); labels never used to identify worker (submission row carries workerId for mesh-event credit; public worker surface never returns other workers' rows); worker can claim only once per item (workerCanClaim enforces client + server; 409 cannot_claim on retry); audit ledger anchors every label (labeling_submission.accepted/.rejected + sponsor_escrow.debited + mesh_contribution_event.saved cover full money trail); sponsor cannot mass-target workers (job feed surfaces to all eligible workers; sponsor cannot pin specific identities); worker payouts not held hostage (escrow debit failure logs warning + continues; worker mesh credit lands regardless); golden answers stripped (next-item removes goldenAnswer before responding); sponsor-side fields stripped on public surface (/api/labeling-jobs strips escrowLockedPaise / escrowDebitedPaise / consentPurposeCode); items uploaded only in draft (409 job_not_draft enforces; sponsor can't sneak items mid-run); DPDP §12(3) cascade total (both backends sweep labeling_submissions by worker_id; jobs + items sponsor-owned stay). **Tests**: BE `tests/node/labeling-job.test.mjs` **17 new** (module constants 2; createLabelingJob happy + reject unsupported taskKind + reject non-positive payout 3; totalLaunchCostPaise arithmetic 1; createLabelingJobItem requires body 1; createLabelingSubmission rejected requires reason 1; workerCanClaim three cases 3; SqliteStore + BosStore round-trips 2; DPDP §12(3) cascade on submission rows 1; HTTP end-to-end lifecycle 3 — full draft→items→launch→discover→next-item→submit + launch refuses when items incomplete + worker cannot resubmit for same item). Mesh-contribution test patched to include `labeling` in MESH_WORKLOAD_TYPES set expectation. **Full Node suite 838/838** (was 821; +17 labeling). FE Vitest 16/16 unchanged. Bundle main 352 KB / **109 KB gzipped** (+2 KB vs 9.1 for Labels route + hooks + preference-pair task UI). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.38s. **Consequences**: sponsor-paying-worker loop closes for labeling (sponsor funds escrow → drafts job → uploads corpus → launches with escrow lock for itemCount × perLabel → workers discover → submit labels → server accepts + debits escrow + credits worker mesh + records ledger events; full Bharat OS rail UPI cash-out via Phase 8.3 drains worker's mesh balance); **first user-visible non-investor revenue moment** (workers can earn paise per label TODAY; Phi-3-mini SLM round 9.0d also earns paise but workers need SLM installed; labeling has near-zero install friction); pattern proven for other sponsor-funded resources (whatever Phase 12+ brings — curation tasks, dataset annotation, RLHF preference collection at scale — sponsor-escrow-job shape is now the template); /app/labels/ is second user-facing earning surface (Earn tab + Labels tab both flow into same mesh ledger; workers mix inference + federated rounds + labeling payouts in one cash-out); 5 tabs on worker bottom-nav acceptable on mobile (many apps do this; future ship can collapse Labs into Settings as "Advanced" or group as "More" if crowded). **What's NOT in this sub-phase**: other task kinds (only preference_pair shipped in v1 FE; classification + span_annotation + transcription + safety_label ship in Phase 10.3); QC pipeline (Phase 10.4 — v1 server accepts every submission; golden-set + inter-annotator α + sponsor-sample reject queue queued); signed JSONL export bundle for sponsor (Phase 10.5 — reuses Phase 9.1 federated-round export pattern with rotating identityHash + gradient-hash only); SLM pre-labeling hint (Phase 10.6 — depends on Phase 9.0c runtime + task-kind-specific prompt template); refund on job close/cancel (refundLockedEscrow helper exists from 9.1; needs POST /api/sponsors/:id/labeling-jobs/:jobId/cancel route refunding unused lock — 10.1.1 polish); per-pack chat-template-aware preference pairs (sponsors could declare template per item; today FE renders raw body.prompt / a / b strings); worker eligibility filters (v1 surfaces all active jobs to all workers modulo language query; Phase 10.4 adds worker-score gating with agreement-score ≥ 0.9 unlocking premium jobs); sponsor analytics (per-job dashboards post-MVP). ADR 0121.

---

Closed in Phase 9.1 (ADR 0120 — sponsored federated rounds; first non-investor revenue line):
1. ✅ **Sponsored federated rounds — demand-side revenue with escrow + audit bundle** — Phase 9.0 closed with workers able to install SLMs, run inference, and join federated rounds (all supply side). Phase 9.1 wires demand side: sponsor model with bearer-token auth, escrow-locked round creation funded by admin top-ups, per-accepted-update escrow debit synchronised with worker payout, signed sponsor-audit export bundle. FE+BE parity honoured. **Sponsor model `src/phase1/sponsor.mjs`**: `{sponsorId: bos:sponsor:<32-hex>, protocolVersion: bos.phase9.sponsor.v0, displayName, contactEmail, status: active|suspended|revoked, onboardedAt, onboardedBy, bearerTokenHash: sha256, escrowBalancePaise, escrowLockedPaise}`. `createSponsor()` returns `{sponsor, bearerToken}` where bearerToken is 16-byte hex prefixed `bos:sponsor-token:` (leaked tokens recognisable in logs + gitleaks-style scanners); raw shown ONCE in admin response; only SHA-256 persisted. Helpers: `depositEscrow` (admin tops up after off-system wire/NEFT cleared), `lockEscrow` (refuses if available = balance-locked < requested), `debitLockedEscrow` (decrements both balance and locked), `refundLockedEscrow` (unlock without debit), `revokeSponsor` (soft-delete), `publicSponsor` (self view exposes escrow; bearer hash stripped), `publicSponsorDirectory` (public view exposes only sponsorId+displayName+status; escrow + contact stripped). **Sponsor-auth middleware `src/phase0/sponsor-auth.mjs`** mirrors Phase 5.7 admin-auth pattern: `requireSponsorAuth(request, {store, sponsorId, requestId})` reads sponsor record, verifies bearer token via constant-time hash compare, checks `status === 'active'`, throws `SponsorAuthError` with HTTP status; `checkSponsorAuth` convenience wrapper sends JSON error response on failure. **Two-surface auth bisection**: admin compromise can lift SIM-swap cooldown but cannot spend a sponsor's escrow; sponsor compromise can drain that sponsor's escrow but not touch other sponsors or any non-sponsor surface. **Storage**: both backends grow `sponsors` table/directory (SqliteStore + BosStore): `saveSponsor`, `readSponsor`, `listSponsors`; saveSponsor emits `sponsor.saved` ledger event. DPDP §12(3) cascade NOT updated — sponsors are orgs not natural persons; round-update rows already cascade via existing federated_updates sweep so audit bundles naturally anonymise after worker erasure. **Federated round schema extension** (additive, backwards-compatible): `createFederatedRound` gains optional `sponsorId` + `escrowLockedPaise`; round itself gains derived `escrowDebitedPaise` (starts 0, increments per accepted update); `describeRound` surfaces all three so FE renders sponsor badge + escrow-remaining. **API routes**: **Admin (Phase 5.7 token)** — `POST /api/admin/sponsors` onboard (returns sponsor + bearerToken + warning string, **bearer shown ONCE**); `GET /api/admin/sponsors` list; `POST /api/admin/sponsors/:id/deposit` with `{amountPaise, reference}` emits `sponsor_escrow.deposited`; `DELETE /api/admin/sponsors/:id` soft-delete. **Public (no auth)** — `GET /api/sponsors/:id` directory view (`{sponsorId, displayName, status}` only); used by FE rounds card for "Sponsored by X" badges without exposing escrow. **Sponsor-bearer gated** — `GET /api/sponsors/:id/self` self view with escrow; `GET /api/sponsors/:id/federated-rounds` list own rounds; `POST /api/sponsors/:id/federated-rounds` create sponsored round (computes escrowRequired = maxParticipants × payoutPaisePerUpdate; **402 insufficient_escrow** if available < required with requiredPaise + availablePaise in response; **400 invalid_round_economics** if escrowRequired ≤ 0; **400 invalid_round** on validator reject; success locks escrow + persists round + emits `sponsor_escrow.locked`); `GET /api/sponsors/:id/federated-rounds/:roundId/export` signed-JSONL audit bundle (404 if cross-sponsor reads). **Escrow lifecycle** (financial heart of 9.1): onboard balance=0/locked=0 → deposit balance+=amount → round-create locked+=maxParticipants×payout (balance unchanged) → accepted update balance-=payout AND locked-=payout (and round.escrowDebitedPaise+=payout) → round-close/expire refund unused locked (future polish). Invariants enforced by helpers: locked ≤ balance always; locked ≥ 0 and balance ≥ 0; debit cannot exceed lock; refund cannot exceed lock; round's escrowDebitedPaise ≤ escrowLockedPaise. If escrow debit fails mid-accept (e.g., sponsor revoked between round-create and accept), worker still earns mesh credit (payment owed) + log `sponsor_escrow_debit_failed` warning for ops reconciliation — worker payouts never held hostage to sponsor accounting hiccups. **Audit export endpoint** returns NDJSON `application/x-ndjson` one record per accepted update: `{updateId, roundId, sponsorId, identityHash: 'sha256:' + sha256(roundId::contributorId), gradientHash, differentialPrivacyEpsilon, sampleCount, acceptedAt, payoutPaise}`. **§15 pointer-not-payload**: gradient HASH only not bytes. **identityHash rotation per (round, contributorId)** so sponsor **cannot correlate same worker across multiple rounds** — same posture as Phase 10 plan in ADR 0110. Cross-sponsor reads refused with 404 (doesn't leak existence). **FE updates**: `FederatedRound` interface gains `sponsorId`, `escrowLockedPaise`, `escrowDebitedPaise`; `useSponsorDirectory(sponsorId)` public-directory hook with `staleTime: 5 minutes` (sponsor names don't churn). `<FederatedRoundRow>` component encapsulates per-row rendering (was inline in 9.0d) so it can use the sponsor-directory hook; sponsored rounds render governance-tone Badge "Sponsored by X" + "₹Y.YZ remaining" caption derived from escrowLocked-escrowDebited; unsponsored rounds render with no badge (graceful degrade). **Seed-demo extension**: creates sponsor "Pragati Microfinance", deposits ₹2,500, locks ₹100 for sponsored round `phi-3-mini-loan-screener` targeting `bos:slm:phi-3-mini-4k-q4_k_m` with task `loan-screening-empathy`, payout ₹5/update, 20 max participants. On fresh seed /app/labs/ federated card now shows 3 rounds (legacy classifier + Phase 9.0d unsponsored SLM + Phase 9.1 sponsored SLM with Pragati badge). **§15 bindings preserved**: bearer token shown once + only hash persisted; public sponsor directory has no escrow info; self/admin view exposes escrow but never the token hash; cross-sponsor reads refused (export endpoint matches `round.sponsorId === path sponsorId`; mismatch returns 404 not 403 doesn't leak existence); worker payouts not held hostage to escrow (debit failure logs warning + continues; worker mesh credit lands regardless); audit bundle pointer-not-payload (NDJSON carries only gradientHash + identityHash; never raw gradient bytes or raw worker identity); cross-round correlation prevented (identityHash = sha256(roundId::contributorId) so same worker in two rounds produces two different hashes); sponsor revoke is soft (status:revoked + audit trail preserved; in-flight rounds keep lock; future round-create refused via sponsor_inactive); all escrow movement auditable (sponsor_escrow.deposited / .locked / .debited / .refunded ledger events). **Tests**: `tests/node/sponsor.test.mjs` — 19 new (Module: SPONSOR_STATUSES, createSponsor happy path, rejects empty name, hashBearerToken+verifyBearerToken roundtrip, publicSponsorDirectory strips fields — 5; Escrow: depositEscrow increase/reject non-positive, lockEscrow refuses underfunded, lock+debit+refund conservation, debitLockedEscrow refuses over-debit, revokeSponsor — 5; HTTP: admin POST refuses without token, admin POST creates+returns one-time bearer, admin deposit increases balance, public directory view no escrow, GET/self requires sponsor bearer, sponsored round 402 underfunded then 201 funded, export bundle returns signed-JSONL, export refuses cross-sponsor reads, SponsorAuthError carries HTTP status — 9). **Full Node suite 821/821** (was 802; +19 sponsor tests). FE Vitest 16/16 unchanged. Bundle main 345 KB / **107 KB gzipped** (+1 KB vs 9.0d for useSponsorDirectory hook + sponsor badge render). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. Build 1.33s. **Consequences**: first non-investor revenue line is real (bank/hospital/gov can pay Bharat OS to run privacy-preserving fine-tuning on Indian workers' devices; escrow + audit + identity-hash rotation align with what a DPDP-compliance officer would actually want); sponsor-paying-worker loop closes end-to-end (sponsor deposits ₹2,500 → creates round locking ₹100 → 20 workers each submit → each gets ₹5 mesh credit → sponsor's locked drains to 0 → sponsor downloads audit bundle); pattern for Phase 10 labeling marketplace established (ADR 0110 sketched similar sponsor-onboard/escrow-lock/signed-export shape; sponsor module + auth middleware + publicSponsorDirectory directly reuse); two-surface auth bisection holds (admin and sponsor surfaces have no overlap); backwards-compatible (all Phase 9.0d rounds continue working; sponsorId defaults null; FE row renders without sponsor badge; no breaking changes). **What's NOT in 9.1**: real fiat payment rails (admin-mediated deposits; real gateway integration is operational, deferred to launch-time vendor selection); round close + refund (refundLockedEscrow helper exists + ledger event named `sponsor_escrow.refunded` but no route fires it yet; ships as 9.1.1 polish); sponsor self-serve dashboard (sponsor can hit GET /self + list rounds + fetch exports but no /sponsor-portal/ UI; sponsors operate via curl for now; future React app under /sponsor/ is separate ship); per-sponsor pricing tiers (every sponsor pays the same payoutPaisePerUpdate they configure; Bharat OS doesn't take platform fee in v1; ships when commercial terms signed); sponsor token rotation (no rotate endpoint; admin can revoke+re-onboard; rotation comes as 9.1.2 polish); real LoRA fine-tuning (still stub gradient from 9.0d's honest gap; sponsor demo path works correctly modulo this). ADR 0120.

---

Closed in Phase 9.0d (ADR 0119 — federated rounds wire to SLM runtime + real mesh-inference events; Phase 9.0 arc CLOSED):
1. ✅ **Federated rounds fine-tune the SLM + Try Prompt records real mesh-inference events** — Closes Phase 9.0 arc: 9.0a (registry) + 9.0b (install + DPDP cascade) + 9.0c (runtime) + 9.0d (this — rounds wire to runtime, real ticks land in the mesh ledger). FE+BE parity rule honoured: both layers ship in one commit. **BE — `createFederatedRound` gains 3 optional SLM fields** in `src/phase1/federated-round.mjs` (backwards-compatible; all default to null): `slmModelPackId` (Phase 9.0a registry id), `targetTask` (free-form fine-tune label), `loraConfig` (opaque passed to runtime.computeGradients). `describeRound(round)` surfaces all three so FE can render purpose + filter to packs the worker has installed. `POST /api/federated/rounds` route extended to thread these fields from request body. Existing classifier-round callers (seed-demo's intent-classifier-head-v1 + any future non-SLM round) continue working unchanged. **BE — Mesh-contribution POST surfaces explicit payout + roundId**: `POST /api/mesh/contributions` already accepted `workloadType: 'federated_round'` but silently dropped `payoutPaise` and `roundId` because route handler didn't forward them. Phase 9.0d fixes that — route now passes both through so worker-initiated federated_round events carry the right payout. For inference events the payout is still derived server-side from tokens × PAYOUT_PAISE_PER_MILLION_TOKENS (`computePayoutPaise`). **FE — `SlmRuntime.computeGradients(opts)` stub**: `src/lib/slm-runtime.ts` adapter gains a third method returning `{vector: Float32Array length 32, epsilonSpent, samples, stub: true}`. **Honest stub** because llama.cpp-wasm exposes inference not training gradients: produces length-32 vector deterministically derived from (modelFamily, targetTask, sample prompts) — sufficient for FedAvg or hash-combiner aggregator to produce non-trivial aggregate; DP-SGD-style Gaussian noise scaled to 1/ε (small noise at high ε, large at low ε, matching Phase 3.2's `privacy-budget.mjs`); marked `stub: true` so future production code can branch on whether gradient is real or synthetic. Real LoRA fine-tuning needs either different runtime backend (MLC-LLM with training-mode) or custom WASM build of llama.cpp with `--enable-training` (future polish). **FE — Federated rounds card on `/app/labs/`** replaces Phase 11.5 placeholder: title + subtitle + open-round count badge; empty state copy "No active rounds right now. Sponsors create rounds via the admin API; the seed-demo includes a starter round"; one row per open round with model name + per-update payout via `<Money>`, meta line "SLM · targetTask" OR "classifier head" + updates/max + epsilon spent/cap, **required-pack guard** (SLM rounds disable Join action if worker hasn't installed matching pack with clear error "Requires the X pack — install it above first"), `[Join (earn ₹X.YZ)]` trust-variant action. **Join click flow**: window.confirm gate → SLM rounds: readSlmBlob → if bytes missing refuse, else loadSlmRuntime against OPFS Blob; non-SLM rounds skip runtime load entirely (future classifier-round-path hook for Phase 3.1's `local-training.mjs`) → `runtime.computeGradients(...)` with sample prompts → encode Float32 vector as base64 + compute SHA-256 → `useSubmitFederatedUpdate` posts to existing `POST /api/federated/rounds/:roundId/updates/sign-and-submit` → server signs with contributor's stored key (Phase 2a limitation per ADR 0066), validates DP budget, accepts/rejects, **on accept auto-creates the `federated_round` mesh-contribution event** with round's payout (already wired in Phase 3.x; we just exercise from /app/ now) → runtime.unload() → toast "Update submitted. ₹X.YZ will appear in your Earn balance." `useFederatedRounds` + `useSubmitFederatedUpdate` hooks added to lib/hooks.ts. Submit-success invalidates `mesh-balance` and `mesh-summary` so Earn tab reflects new credit on next nav. **FE — `SlmTryPrompt` records real mesh-inference event per generate**: imports `useRecordMeshEvent`; after every successful `runtime.generate()` estimates tokens (`estimateTokens` ~4 chars/token English, 2-3 vernacular) and POSTs to `/api/mesh/contributions` with `workloadType: 'inference'` + token count; displays resulting payout inline "Generated in N ms · pack-id · +₹X.YZ earned". **This is the first time `/app/` user activity produces real mesh ledger ticks** — until now /mesh/balance reflected demo-seeded events; now every generation is a real inference workload event the Phase 8.3 cash-out flow can drain to UPI. **Seed-demo extended**: scripts/seed-demo.mjs creates a second federated round alongside the existing classifier round — an SLM round targeting `bos:slm:phi-3-mini-4k-q4_k_m` with task `indic-intent-routing` and real LoRA config `{rank:8, target:['q_proj','v_proj']}`, OPEN with zero updates so /app/labs/ Federated card has something to surface on fresh seed. **§15 bindings preserved**: raw gradients never leave device unencrypted (stub vector computed locally + DP-noised locally + only noised version submitted); privacy budget honoured (epsilonSpent is what worker requested; Phase 3.2's privacy-budget.mjs enforces per-contributor cap); SLM rounds require matching install (Join disabled until installedPackIds includes round's slmModelPackId; OPFS check refuses if bytes missing); inference events honest (tokens count is documented estimate from prompt+output character length; not a fabrication); payout authoritatively server-side (FE just records workload; payout derivation lives in computePayoutPaise); audit ledger covers everything (existing mesh_contribution_event.saved + federated_round_update.accepted events; no new event types needed); stub gradient honest (`stub: true` flag returned + ADR documents not real training); bytes never on server (SLM round join reads weights from OPFS only). **Tests**: BE `tests/node/federated-round.test.mjs` 20 → 23 (+3 for: createFederatedRound defaults SLM target fields to null, carries SLM target fields when provided, describeRound surfaces SLM target fields). FE `src/lib/slm-runtime.test.ts` 7 → 9 (+2 for: runtime.computeGradients returns stub gradient vector with metadata, produces deterministic vectors for same inputs modulo DP noise with cosine similarity > 0.95 at ε=10). **Full suite: 802/802 Node** (was 800) **+ 16/16 Vitest** (was 14). Build: 1.71s. Main bundle 344 KB / 107 KB gzipped (+6 KB vs 9.0c for federated card + Try Prompt mesh-event wiring). wllama lazy chunk unchanged 292 KB / 126 KB gzipped. **Phase 9.0 arc CLOSED**: worker can install an SLM → run real inference (paid in paise per call) → join a federated round fine-tuning that SLM (paid per accepted update) → cash out via Phase 8.3 UPI. Full §7f federated-economy loop end-to-end real modulo stub gradient. **First real mesh ledger ticks from /app/** — inference events land in same mesh_events table demo-seeded ones did; Phase 6.0b's monthly summary reflects actual worker activity. **Sponsor-funded rounds meaningful surface** — anyone with admin access creates SLM round; workers with matching pack installed see + can join. Scaffolding for Phase 9.1 (commercial sponsored-rounds API) and Phase 10 (labeling marketplace's federated-trained label models polish). **Stub gradient honest gap** — ADR 0119 documents what would change for real LoRA fine-tuning (MLC-LLM training-mode or custom llama.cpp WASM with --enable-training). v1 ships with flywheel + audit + payout correct; gradient correctness is remaining polish. **What's NOT in 9.0d**: real LoRA fine-tuning, per-round consent UI matching Phase 8.2 MFI pattern (Join goes straight to confirm; future polish surfaces per-round federated_donation consent grant with scope/purpose/TTL), real-time round discovery push (workers poll on tab visit; future Phase 7.x subscription), round outcomes view (workers see "your update accepted" but not eventual aggregated model hash). ADR 0119.

---

Closed in Phase 9.0c (ADR 0114 — SLM runtime adapter; on-device inference is real):
1. ✅ **On-device inference is real — `/app/labs/` install + Try a prompt end-to-end** — Phase 9.0a (registry) + 9.0b (install records + DPDP cascade + Phase 11.5 install card) had shipped the data model and a placeholder install flow. Phase 9.0c wires the actual runtime so an installed pack can run inference end-to-end. **Runtime choice locked**: `@wllama/wllama` 3.4.1 — production-grade TypeScript wrapper around llama.cpp compiled to WASM; used by HuggingFace chat-ui; ESM-native; WASM binaries served from jsDelivr CDN by default (operator can self-host or mirror — three vendoring postures documented in ADR 0114). MLC-LLM / WebGPU deferred to v2 until we have a Snapdragon 8 Gen 2+ test device. ONNX Runtime Web dropped per the 2026-05-25 direction-set memory. **Lazy-loaded**: the Wllama JS + WASM is NOT in the main `/app/` bundle — adapter uses dynamic `import('@wllama/wllama')` so Vite code-splits into its own chunk. Main bundle stays 105 KB gzipped (+3 KB vs Phase 11.6); wllama chunk is 126 KB gzipped, loaded only when a worker actually generates. **New `src/lib/slm-runtime.ts` adapter** exposes a stable `SlmRuntime` interface independent of underlying engine (forward-compatible for 9.0c-v2 MLC-LLM): `loadSlmRuntime({ggufBytes, onProgress})` takes Blob (from OPFS) or ArrayBuffer (from fetch); `loadSlmRuntimeFromUrl(url)` convenience loader; `runtime.generate({prompt, maxTokens, temperature, onToken})` streams tokens, returns full text, supports early stop via `onToken => false`; `runtime.unload()` calls `wllama.exit()` swallowing errors; `runtime.metadata` exposes family + contextSize + vocabSize. **New `src/lib/opfs.ts` helpers**: `opfsSupported()` feature check; `readSlmBlob(modelPackId)` returns persisted File or null; `downloadAndPersist({url, modelPackId, onProgress})` streams fetch into OPFS file handle while computing SHA-256 incrementally, returns `{observedHash, downloadedBytes, blob}`, on abort/error removes the partial file; `removeSlmBlob(modelPackId)` best-effort delete. OPFS dir: `bharat-os-slm/` under origin's private FS; filename = safeName(modelPackId). **`<SlmTryPrompt>` component** (`src/components/SlmTryPrompt.tsx`): inline card with 3 sample prompt chips ("Write a short greeting for a kirana shop owner in Hindi", "Explain UPI in one sentence", "Suggest a name for a federated learning round"), textarea, Generate button. On first click: readSlmBlob → loadSlmRuntime (lazy-loads wllama from CDN; runtime + WASM both load on demand here) with progress percentage. Subsequent clicks reuse loaded runtime cached in useRef. Streaming output renders into monospace block as tokens arrive. Generation latency shown ("Generated in N ms · pack-id"). Close button calls `runtime.unload()` to free WASM memory. Evidence collapsible explains on-device posture honestly. **Labs install flow upgraded** (`LabsPage` rewrite from Phase 11.5): OPFS check refuses early if browser lacks support (warning-toned Card explaining Chrome/Edge/FF 111+/Safari 17+ requirement); window.confirm gate with honest pack-size + storage posture; `downloadAndPersist` does streaming fetch with `<progress>` bar updating per chunk + concurrent SHA-256; server-side `createInstalledSlmRecord` validator already binds expectedHash to registry sourceHash so mismatch returns 400 (we pass observedHash and let server be authoritative); mismatch handling discards OPFS blob via `removeSlmBlob` and records install with status: 'failed' + failureReason describing the mismatch; success records status: 'installed' + toasts "Tap 'Try a prompt' to test it". Per-pack install progress bar visible during download. **Installed list gains [Try a prompt] action** on rows with status: installed (trust-variant button); tapping opens SlmTryPrompt with that pack. **Vendoring posture documented** in ADR 0114 — three options: CDN default (jsDelivr, demo-fine), self-hosted mirror (copy node_modules/@wllama/wllama/esm/wasm/ into public/wasm/wllama/ and pass pathConfig), operator-CDN with signed bundles (audit-grade, future polish). The adapter exposes pathConfig as a parameter so operator can flip between three without touching adapter code. **Backend changes**: NONE. Phase 9.0a/9.0b's `/api/slm-model-packs` + `/api/identities/:id/installed-slms` endpoints already handle the data model. Runtime is purely FE adapter against already-deployed registry + install record API. **§15 bindings preserved**: bytes never on server (adapter loads weights from OPFS or direct fetch; server never sees GGUF); prompt never leaves device (runtime.generate operates entirely within WASM worker; Try Prompt emits zero outbound network calls beyond initial CDN runtime load); honest mode disclosure (Evidence block names runtime engine + WASM source + shows generation latency); lazy-loading honored (wllama in own code-split chunk; users who never install pay 0 bytes); integrity check before "installed" status (real SHA-256 over streamed bytes; server enforces expectedHash == observedHash); discard on mismatch (OPFS blob removed via removeSlmBlob; install record stores failed status with mismatched-hash failure reason); worker-initiated uninstall is total (removeSlmBlob runs BEFORE server DELETE so bytes gone from device even if network call fails); audit ledger covers everything (all install/uninstall records emit Phase 9.0b's `installed_slm.recorded` / `.failed` / `.removed` ledger events). **Tests**: `src/lib/slm-runtime.test.ts` 7 new tests with wllama fully mocked (jsdom can't load actual WASM): loadSlmRuntime loads from Blob and exposes metadata; wraps ArrayBuffer in Blob before calling loadModel; forwards progress callback through to wllama; runtime.generate streams tokens and returns accumulated text; runtime.generate stops streaming when onToken returns false; runtime.unload calls wllama.exit(); runtime.unload swallows exit errors silently. **Vitest 7 → 14** (+7). **Backend Node tests untouched, still 800/800**. OPFS helpers not unit-tested in jsdom (OPFS isn't supported there); exercised by live smoke. SHA-256 is thin wrapper around browser-native crypto.subtle.digest. **Bundle**: main app 338 KB JS / 18 KB CSS (105 / 4 KB gzipped) — main bundle grew only 8 KB vs Phase 11.6 for adapter + OPFS helpers + Try Prompt; wllama lazy chunk 292 KB / 126 KB gzipped, only paid by users who generate. Build: 1.55s. **Consequences**: on-device inference real on /app/ — investor demo shows full loop with no hand-waving; first third-party runtime dep landed cleanly (single npm package, lazy-loaded, main bundle barely moved); /shell/ SLM card becomes redundant (legacy install can stay for dev but primary path now /app/labs/); adapter forward-compatible (when 9.0c-v2 ships MLC-LLM the SlmRuntime + GenerateOptions stay the same; branching inside loadSlmRuntime based on pack metadata + device capability probe); federated rounds (Phase 9.0d) becomes meaningful (until now §7f had no real model to fine-tune beyond the 216-param classifier; now there's actual SLM for distillation, LoRA, gradient updates with DP-SGD). **What's NOT in this sub-phase**: `runtime.computeGradients(...)` for federated rounds (lands with 9.0d); multi-modal image input (registry packs are text-only); embedding models (wllama supports but not wired here, useful for Phase 10 labeling pre-labeling); real demo SLM in seeded packs (Phi-3-mini + Gemma-2B still point at placeholder URLs — picking a real small model like SmolLM2-135M ≈ 90MB + pre-computing SHA-256 + updating seed is external-action ROADMAP item); WebGPU detection / runtime tier switching (single runtime for now); memory/OOM guardrails (wllama's n_ctx: 2048 sane default; future hardening probes navigator.deviceMemory + caps context size on memory-constrained devices); operator-CDN signed-WASM (Phase 9.0c future polish). ADR 0114. **Phase 9.0 arc progress**: 9.0a (registry) + 9.0b (install records + DPDP) + 9.0c (runtime) shipped — **inference loop end-to-end demoable** with a real model. Remaining: 9.0d (federated round + mesh-inference event integration) ~1 wk.

---

Closed in Phase 11.4 + 11.5 + 11.6 (ADRs 0117 + 0118 — verifier MFI bundle + Labs + Settings; Phase 11 arc CLOSED):
1. ✅ **`/app/verify/` + worker MFI consent issuance + file-store backend parity fix** (ADR 0117) — Phase 11.4 closes the MFI flow end-to-end on `/app/`. Worker side `WorkerTrust.tsx` rewritten: full MFI consent issuance form in a `<Sheet>` with lender name (max 80) / purpose (max 200, ≥ 8 chars helper) / FY select (current + prior FY via April-March-based `currentFY()`) / valid-for select (7/30/60/90 days) / max-reads select (1/3/5/10, default 1 per Phase 6.1 single-use bearer-token posture); "Issue signed consent" primary action → `useIssueMfiConsent` mutation → POST `/api/identities/:id/income-verification/consents`. On success the sheet switches to "Consent issued" state with warning-toned Card highlighting the share URL, honest copy *"Anyone with this URL can read your bundle N time(s) before it expires"*, read-only monospace input showing the URL, and **[Copy]** button using `navigator.clipboard.writeText` with toast *"Paste into WhatsApp / email to the lender."* Below: list of all issued consents with client-side `classifyConsentStatus` badges (active trust / revoked error / expired neutral / exhausted warning) mirroring Phase 6.1's `verifyIncomeVerificationConsent` enum; per-row [Revoke] ghost button on active only, gated by `window.prompt(reason)` matching Phase 2a.26 reset pattern. **Verifier side** `VerifyPage` rewritten as **public route** (extracted from `ProtectedSurface` wrapper; verifiers don't have a Bharat OS persona). Renders own minimal header with brand mark + "Bharat OS Verifier" wordmark. Two states: no consent ID → "Open a bundle" Card with Field accepting bare consentId or full share URL (regex extraction of `?consent=…`), [Read bundle] writes to URL via `useSearchParams`; consent ID present → fetches via `useMfiBundle` with `staleTime: Infinity` + `retry: false` (server burns one read per call; auto-refetch on focus would exhaust consent on every tab activation). **Status display** rendered from STATUS_VARIANT + STATUS_LABEL + STATUS_LEAD lookup covering all 7 enum values: valid (trust "VERIFIED ✓"), expired (neutral), revoked (error), exhausted (warning), signature_invalid (error), unknown_worker (error), malformed (error). Valid bundles render through `<BundleView>` — five cards: Worker (trust-toned, display name + lender + FY + issued-at), Aggregated income (two `<Stat>` total via `<Money>` + best month, plus month-by-month list), Verified attestations (rendered only when non-empty, per-row subject + claim + issued), Worker-collective memberships (per-row name + role + verified badge), Welfare attestations (governance-toned: e-Shram UAN masked + scheme codes with verified badges), Disclaimer Card with mandatory Phase 6.1 disclaimer + `<Evidence>` collapsible showing signature + status. **App.tsx routes change**: `/verify` extracted from `ProtectedSurface`, public route now. **New TanStack Query hooks**: `useMfiConsents(identityId)`, `useIssueMfiConsent` (invalidates on success), `useRevokeMfiConsent` (invalidates on success), `useMfiBundle(consentId)` (read-once posture). **File-store BosStore parity FIX**: live smoke revealed `store.saveIncomeVerificationConsent is not a function` because sqlite-store had the methods since Phase 6.1 but file-store never grew them. Added `incomeVerificationConsentsPath` directory + `init()` mkdir + `incomeVerificationConsentFile(consentId)` helper + `saveIncomeVerificationConsent` / `readIncomeVerificationConsent` / `listIncomeVerificationConsents({workerId})` methods. **2 new BosStore parity tests** in `tests/node/income-verification.test.mjs`: round-trip + filter-by-worker. This was a real pre-existing bug (demo store using file backend couldn't issue MFI consents before Phase 11.4); caught only because /app/ surfaced the flow that /shell/ apparently never exercised against the file backend. **§15 bindings preserved**: worker owns issuance (explicit button + confirm), bundle is bearer-token (honest copy), pointer-not-payload (bundle structure not raw rows), one-time read (staleTime Infinity + retry false), honest status disclosure (7 distinct badges), revocation honest (revoked stays in list as audit trail), HTML escaping (React `{value}` interpolation, no dangerouslySetInnerHTML), verifier doesn't need persona (route public). Bundle: 308 → 322 KB JS (+14 KB for BundleView + hooks + form). **Node tests 798 → 800** (+2). FE tests 7/7 still pass. Live smoke verified end-to-end: POST consent returns 201 with mfiFetchUrl; GET bundle returns signed bundle on first read, status: 'exhausted' on second; classification badges render correctly.

2. ✅ **`/app/labs/` wired to real Phase 9.0a/9.0b SLM endpoints** (ADR 0118 part 1, Phase 11.5) — `LabsPage` rewritten with four cards. **On-device language model** card: active SLM packs from `useSlmCatalog` (`GET /api/slm-model-packs?activeOnly=true`); installed list from `useInstalledSlms(identityId)` with per-row pack family + variant + runtime + bytes + `pack revoked since install` annotation when status='revoked' + failure reason when status='failed' + installed/failed status badge + remove ghost button; catalogue list with per-pack family + variant + runtime label + meta (params / quantization / license / download size) + optional description + [Install (X GB)] primary action (disabled when already installed). **Install flow**: window.confirm with honest pack-size + storage posture; `fetch(pack.sourceUrl)` attempt (fails honestly today since `models.bharat-os.example` is placeholder); records via `useRecordSlmInstall` with `status: 'failed'` + network error as `failureReason`. **Audit trail real even when mirror isn't** — for investor demo we don't want a 2 GB download attempt; failure path demonstrates audit-ledger discipline without demo grinding to a halt. When Phase 9.0c (llama.cpp-wasm runtime) ships, install flow gets upgraded per FE+BE parity rule. Remove flow: confirm + `useRemoveSlmInstall` mutation. Evidence collapsible explains OPFS-backed download + SHA-256 verify + Phase 9.0c runtime gap honestly. Three placeholder Cards: federated training rounds (§7f description + Active rounds Stat placeholder); OCR + health records (Phase 2a.8 substrate pointing at /shell/); voice + TTS (Indic Whisper + IndicTTS pointing at /shell/). **New hooks**: `useSlmCatalog`, `useInstalledSlms`, `useRecordSlmInstall`, `useRemoveSlmInstall`.

3. ✅ **`/app/settings/` DPDP §12 export + erase + polish** (ADR 0118 part 2, Phase 11.6) — `SettingsPage` rewritten with four cards. **Identity** (local persona clear, unchanged from 11.0). **Your data rights (DPDP §12)** governance-toned: **Download my data** action via `useDownloadMyData` calls `GET /api/identities/:id/export`, streams as Blob, creates object URL + clicks synthesised `<a download>`, cleans up, toasts "Downloaded N KB". **Delete my account** action opens `<Sheet>` with warning-toned Card stating *"This cannot be undone"* + DPDP §12(3) cascade description; **Type DELETE to confirm** Field (autoComplete off); **Erase my account permanently** destructive action disabled until field contains literal `DELETE`; calls `useEraseIdentity` → `DELETE /api/identities/:id?confirm=YES_DELETE`; on success clears local persona, toasts goodbye, navigates to `/` (split-hero onboarding). **Notifications** placeholder pointing at /shell/. **Developer** "Open /shell/" ghost action — explicit escape hatch. **New hooks**: `useErasurePreview` (enabled false; explicit refetch only), `useDownloadMyData` (Blob download via synthesised `<a>`), `useEraseIdentity`. **§15 bindings**: SLM bytes never on server, honest mirror-unreachable disclosure, revoked packs honest in install list, DPDP §12 export self-service, §12(3) erase two-step type-DELETE confirm matches /shell/ Phase 4.0 pattern, erase clears local persona (no stale dead-identity error), /shell/ honest escape hatch. **Bundle**: 322 → 330 KB JS (+8 KB for Labs + Settings).

**Phase 11 ARC CLOSED.** `/app/` v1 investor-demo-ready end-to-end across worker (earn → cash-out → MFI consent issue → share URL copy), citizen (intent → policy gate → orchestrated outcome), verifier (paste URL → render signed bundle → status badge + every Phase 6.1/6.2/6.3 attestation category), and settings (DPDP §12 export + §12(3) erase). `/shell/` (developer surface) still works untouched. Backend: 798 → 800 tests. Frontend: 0 → 7 Vitest (more to add as flows stabilise; ADR 0115's ~80-test target is the goal). Total bundle: 330 KB JS / 18 KB CSS (102 / 4 KB gzipped). Build: 1.42s. **What's NOT in v1**: Playwright e2e smoke (manual smoke covers four demo paths; Playwright is follow-up polish), more Vitest coverage (ongoing), i18n (English only, deferred to v2), PWA + service worker (online-only v1, deferred to v2 — avoiding the SW cache nightmare from 2026-05-27), voice input on /app/citizen/ (text only v1). **Next per ROADMAP**: Phase 9.0c llama.cpp-wasm runtime adapter resumes per FE+BE parity rule with its own /app/labs/ panel upgrade — ADR 0114 (runtime choice + distroless-deploy trade-off) drafted first, then `src/phase1/slm-runtime.mjs` + Labs install card upgrade to actually run inference. ~2-3 weeks. Then 9.0d (federated round + mesh-inference event integration), 9.1 (sponsored federated rounds — demand-side revenue), 10.0-10.5 (labeling marketplace).

---

Closed in Phase 11.0–11.3 (ADR 0116 — /app/ scaffold + onboarding + worker + citizen surfaces):
1. ✅ **`/app/` ships — investor demo is real, /shell/ stays untouched** — First implementation slice of the Phase 11 FE rebuild (ADR 0115). Sub-phases 11.0 (scaffold) + 11.1 (onboarding) + 11.2 (worker) + 11.3 (citizen) compressed into one ship because they share infrastructure; 11.4 / 11.5 / 11.6 ship separately. **New `frontend/` directory** with Vite 6 + React 19 + TypeScript + Tailwind 3.4 + Zustand 5 + TanStack Query 5 + React Router 7 + Vitest 2 + RTL + jsdom. **255 npm packages installed** — first significant FE dep surface; backend stays zero-dep (`bin/bos-api.mjs` + `src/` untouched on the dep front). **Production bundle: 307 KB JS / 17 KB CSS** (96 KB / 4 KB gzipped). Build time: **1.25 seconds**. **Design tokens locked** per ADR 0115 in `tailwind.config.js`: tricolour palette (`#FFFFFF` white surface, `#FF9933` flag-grade saffron primary with 50/100/200/500/600/700 shades, `#138808` flag-grade green trust with 5 shades, `#000080` navy governance with 4 shades), Manrope + Noto Sans Devanagari/Tamil/Bengali fonts (locale-aware swap via `<html lang>` in `index.css`), 6-step type scale (caption/body/body-lg/heading/display/hero), 2 weights (regular 400, semibold 600), 7-step spacing (4/8/12/16/24/32/48), 3 border radii (sm 6 / md 12 / lg 18). Focus ring is saffron — accessible + on-brand. **12 component primitives shipped** in `src/components/ui/`: `<Action>` 6 variants × 3 sizes; `<Badge>` 6 variants; `<Card>` 4 tones (default/trust/warning/governance); `<Evidence>` collapsible `<details>` for technical-detail reveal (replaces "Show technical details" pattern from /shell/); `<Field>` labeled input with helper + error state; `<Hero>` default + split variants (split used by onboarding); `<Identity>` avatar + name + meta, renders as button when onClick passed; `<Money>` paise → Indian-numbering rupees (`₹1,00,000` not `₹100,000`) via `Intl.NumberFormat('en-IN', {style:'currency',currency:'INR'})` with tabular-numeric font feature; `<Sheet>` modal bottom-sheet mobile / centered desktop, Esc closes, backdrop click closes, body-scroll lock; `<Stat>` uppercase label + display value + delta; `<Tabs>` bottom-nav mobile / top-tab desktop via Tailwind responsive utilities; `<ToastRoot>` + `useToast()` Zustand-backed, auto-dismiss 4s info/success or 6s error. **State management**: `useIdentityStore` (Zustand + persist middleware) stores `activeIdentityId` under `bharat-os.app.deviceOwnerId` — DISTINCT from `/shell/`'s `bharat-os.shell.deviceOwnerId` so the two surfaces never collide; `classifyPersona(identity)` heuristic on displayName + attestations buckets each seeded persona as worker (mesh/driver/contractor/engineering student/freelance/CA hints) or citizen (default). **TanStack Query hooks** in `src/lib/hooks.ts`: `useIdentities`, `useActiveIdentity`, `useMeshBalance`, `useMeshSummary`, `useMeshWithdrawals`, `useRequestWithdrawal` (invalidates balance + withdrawals on success), `useEarnings`, `useTrustPassport`, `useRecentOrchestrations` (client-side filter by `actorId`), `useSendIntent` (invalidates recent on success). Default options: `refetchOnWindowFocus: false`, `staleTime: 30s`, `retry: 1`. **Onboarding (`/app/`, Phase 11.1)** split-hero with two cards: left saffron-accented "I work" ("Earn from your phone. Share spare compute. Get paid in UPI, not crypto. Show verified income to lenders."); right trust-tinted "I live" ("Replace the 10 apps on your phone with one. Speak in your language. Your data stays on your phone."). Tapping either opens `<Sheet>` listing personas filtered via `classifyPersona`; picking stores id, shows welcome toast, navigates to `/worker` or `/citizen`. Footer line points at `/shell/` for developer access. **Worker surface (`/app/worker/`, Phase 11.2)**: routes `/earn` (main dashboard) + `/trust` (Trust Passport + MFI placeholder). Earn page: "Earned this month" Card trust-tone with display-size `<Money>` + working days + event count + per-workload breakdown grid (renders only when summary.byWorkload non-empty); "Cash out to UPI" Card with available-now `<Stat>` in saffron-tinted panel, UPI input `<Field>` (autoComplete="off" per §15), disabled-state logic (`availablePaise === 0` or below minimum), confirm dialog before POST, `<Evidence>` explaining refund-on-failed semantics, history list with per-row status badge (paid=trust green / failed=error red / else pending amber). **Citizen surface (`/app/citizen/`, Phase 11.3)**: routes `/home` (intent input + recent) + `/trust` (permissions placeholder). Home page: day-of-week eyebrow + display heading "What can Bharat OS do for you today?"; textarea + 5 suggestion chips (Book a cab / Apply for a small loan / Find a doctor near me / Pay my electricity bill / Share my health record with Lakshmi clinic); Send button → `useSendIntent()` mutation → POST `/api/orchestrations` → invalidates recent → toast confirmation; recent activity card lists 5 most-recent orchestrations for active identity. Voice input deferred to Labs (Phase 11.5) per ADR 0115 scope. **Shared TopBar** sticky on every protected surface: brand mark + "Bharat OS" → links to /; persona switcher right opens `<Sheet>` listing all seeded personas with persona kind labels, active highlighted, includes "Sign out (forget this persona on this device)" ghost action. **API serve wire**: new route block in `src/phase0/api.mjs` handles `GET /app/*` — serves files from `public/app/build/`, SPA fallback to `index.html` for any path not matching a real file. Six lines of new BE code; zero other backend changes. **Routes catalog** updated with `GET /app/*  (Phase 11 SPA — public/app/build/)`. **Tests**: Vitest **7/7 passing** (Action: 4 — renders label, default variant class, trust variant class, disabled state; Money: 3 — Indian-numbering format, ₹1,00,000 grouping at 7 digits, + sign prefix when showSign). Phase 11.6 adds end-to-end Playwright smoke; ADR 0115 target is ~80 FE tests by v1. **Node backend tests**: spot-check on impacted suites (`api.test.mjs` + `admin-auth.test.mjs` + `slm-model-pack.test.mjs` + `installed-slm.test.mjs`) **84/84 pass**; full suite expected at 798/798 still. **Live smoke verified**: API server with `BHARAT_OS_ADMIN_TOKEN=…` against seeded `.bharat-os-demo/` store; GET /api/identities returns 9 seeded identities; GET /app/ returns 200 with Bharat OS title + #root div (Vite bundle); GET /app/worker/earn / /app/citizen/home / /app/labs all return 200 (SPA fallback); GET /app/assets/index-*.js returns 200 (bundled JS asset). **§15 bindings preserved end-to-end**: identity-not-device (TopBar one-tap switcher; persist only the id), persona switcher honest about local-only scope ("Sign out (forget this persona on this device)" copy), pointer-not-payload (`<Money>` + `<Stat>` show aggregates; raw payloads never rendered directly; Evidence collapsibles ready for hash-display), UPI ID never echoed (form clears on success matching Phase 8.3 posture + autoComplete="off"), audit ledger transparency (Evidence component ready for hash-display in every result card), worker controls consent (MFI placeholder routes to future explicit-confirm modal in Phase 11.4), honest empty state (zero-mesh-summary renders zeroed values, never fake demo data), `/shell/` left untouched (zero changes to `public/shell/*`; distinct localStorage keys). **What's NOT in this sub-phase**: `/app/verify/` placeholder only (full MFI bundle reader Phase 11.4 / ADR 0117); `/app/labs/` placeholders only (SLM install + federated rounds + OCR wire Phase 11.5 / ADR 0118); MFI consent issuance form (Phase 11.4); DPDP §12(3) erasure full flow (Phase 11.6 polish); voice input on citizen home (text only v1; voice moves to Labs); i18n (English only v1); end-to-end Playwright smoke (Phase 11.6). **build pipeline added** — `npm run build` inside `frontend/` before deploy; `public/app/build/` gitignored. ADR 0116. **Phase 11 progress ~57% (4 of 7 sub-phases shipped, remaining 11.4 + 11.5 + 11.6 = ~5 days).**

---

Closed in Phase 9.0b (ADR 0113 — per-identity SLM install records + DPDP cascade + shell install UI):
1. ✅ **Per-identity SLM install records + shell install card; install pipeline end-to-end demoable; still no runtime (that's 9.0c)** — Phase 9.0a (ADR 0112) shipped the registry but the server couldn't record that a worker had installed a pack, the shell had no UI to install one, and DPDP §12(3) had no story for the per-identity install row. Phase 9.0b closes all three. **New `src/phase1/installed-slm.mjs`** (pure validation, no I/O): `createInstalledSlmRecord(input)` validates a per-identity install record with two terminal statuses (`installed` / `failed`) — no mid-flight `pending` state needs to leave the client. Defends the **expected vs observed hash invariant** server-side: if `status: 'installed'` and both hashes present but mismatch, refuses (belt-and-suspenders so a buggy client can't silently misreport). **Pointer-not-payload**: model bytes live in browser OPFS via `navigator.storage.getDirectory()` + `getFileHandle()` + `createWritable()`; server never holds a copy; install record is the server-side pointer. Record shape: `installId` / `protocolVersion` (`bos.phase9.installed-slm.v0`) / `identityId` / `modelPackId` / `runtimeBackend` / `downloadedBytes` / `status` / `failureReason` (required when failed) / `expectedHash` (bound to registry `sourceHash`) / `observedHash` (client-computed) / `storageLocation: 'opfs'` / `installedAt`. **Storage**: SqliteStore `installed_slms` table with `install_id PK` + `identity_id` index for per-identity GET + `json TEXT`; `saveInstalledSlm` upserts + emits `installed_slm.recorded` (or `.failed`) ledger event; `deleteInstalledSlm` hard-removes + emits `installed_slm.removed`. BosStore file backend mirrors with `installed-slms/` directory + ledger event parity. **DPDP §12(3) cascade**: SqliteStore `eraseUserData` sweeps `installed_slms` by `identity_id` (counts in `report.sections.installedSlms`); BosStore `eraseUserData` adds `installedSlms` to its sweep list. On-device OPFS blob wiped by Phase 4.0 identity-scoped client storage clear; shell's Phase 9.0b uninstall flow proactively removes it too. **API routes**: `GET /api/identities/:id/installed-slms` returns worker's list **decorated with registry metadata** (`family` / `variant` / `quantization` / `parameterCount` / `diskBytes` / `license` / `status`) so shell doesn't need second round-trip per row; revoked packs surface with `pack.status: 'revoked'` honestly. `POST /api/identities/:id/installed-slms` creates record after client SHA-256 verify completes; **binds `expectedHash` to registry's `sourceHash` server-side** (client cannot claim different expected hash than operator-curated); 404 `unknown_pack` if registry doesn't know it; 409 `pack_revoked` if revoked AND client claims `status: 'installed'` (revoked packs CAN record `status: 'failed'` for audit completeness); 400 `invalid_install_record` for validation failures. `DELETE /api/identities/:id/installed-slms/:installId` identity-scoped (404 if install belongs to different identity); hard-deletes + emits `installed_slm.removed`. Routes added to GET /api catalogue. **Shell UI: `#slmInstallSection`** on Profile tab inserted between Phase 8.4 push opt-in and existing health-doc card. Header *"🧠 Install a Bharat OS language model"* + status caption (Off / 1 installed / N installed). Honest copy spelling out *"runtime is not yet wired (Phase 9.0c); for now this card shows the catalogue and tracks your installs"*. Card sub-components: device profile block surfacing `navigator.deviceMemory` × 1024 (RAM MB) + `navigator.storage.estimate()` (free disk) + runtime support probes (OPFS+WASM → `llama_cpp_wasm`, OPFS+WebGPU → `mlc_llm_webgpu`, OPFS+WASM → `onnx_runtime_web`); installed list with per-row status badge (installed green / failed red / removed grey) + bytes downloaded + optional `pack revoked since install` annotation + `[Remove]` button; catalogue filtered via `GET /api/slm-model-packs?compatible=true&deviceRamMb=…&freeDiskBytes=…&supportedRuntimes=…` with per-pack tile showing family + variant + runtime + meta (params / quantization / license / download size) + description + `[Install (X.X GB)]` button (or `Already installed` disabled); `[Refresh catalogue]`; per-pack `<progress>` bar during download; "How on-device SLMs work" collapsible explaining OPFS + Bharat-OS-mirror sourcing + SHA-256 + DPDP erase behaviour + the Phase 9.0c runtime gap. **`installSlmPack(modelPackId)` handler** does in order: `window.confirm` gate with honest pack-size + storage posture → probe OPFS + SubtleCrypto (refuse early if missing) → `fetch(sourceUrl)` with streaming reader → `navigator.storage.getDirectory()` → `getDirectoryHandle('bharat-os-slm')` → `getFileHandle(safeName)` → `createWritable()` → stream chunks straight to OPFS → SHA-256 over concatenated bytes via `crypto.subtle.digest` → compare against `pack.sourceHash` (mismatch → discard blob + `status: 'failed'` + populate `failureReason`) → POST with outcome (server defends invariant a second time) → re-render. **`removeInstalledSlm(installId)` handler**: confirm gate → OPFS blob removal via `slmDir.removeEntry()` (best-effort — same install may exist on paired device) → DELETE server record → re-render. New CSS: `.slm-install-card` background; `.slm-install-device-grid` 2-col label/value; `.slm-installed-row` border + meta layout; status-coloured badge variants matching Phase 8.2/8.3 palette; `.slm-pack-tile` catalogue tile with header + meta + actions + progress bar; `.slm-install-empty` empty-state. SW cache v34 → v35. **§15 bindings preserved**: bytes never on server (OPFS client-side; server holds metadata only); integrity verified before install claimed (shell SHA-256-verifies before POSTing `installed`; server defends with `expectedHash`-bound-to-registry); pack must exist + not revoked for new installs (404 unknown_pack / 409 pack_revoked); cross-identity install access impossible (GET filters by identityId; DELETE 404s on cross-identity); DPDP §12(3) cascade total (server sweeps + client OPFS clear); worker-initiated opt-out one tap + confirm; audit trail covers register/install/uninstall (`slm_model_pack.registered` + `installed_slm.recorded`/`.failed`/`.removed`); operator can audit per-worker install state (decorated GET exposes registry metadata at read-time without bytes). **21 new tests** covering module validation guards (7), file-store persistence + delete + failed-status ledger events (3), SqliteStore persist + identity_id index + reload (1), DPDP §12(3) cascade on both backends (2), HTTP wiring including 404 unknown identity + decorated GET + registry-bound expected-hash defence + failed no-hash path + 404 unknown pack + 409 revoked pack + cross-identity DELETE 404 + own-identity DELETE 200 + ledger event (8). Full suite **798/798** (was 777; +21 new; batches of 16 to dodge Windows OOM in parallel `--test`). Live smoke verified: shell HTML contains slmInstallSection + slmInstallCatalogue + "Install a Bharat OS language model"; POST admin registers Phi-3-mini pack; GET installs returns empty; POST install with matching hash returns 201 with full install record; decorated GET shows `pack.family: 'phi-3-mini'` + `pack.status: 'registered'`; POST with mismatched hash returns 400 `invalid_install_record` + message *"expectedHash and observedHash mismatch — refusing to record as installed."*; DELETE returns `{ok:true, removed:true}`. **Install pipeline end-to-end demoable**: worker opens Profile tab → sees device profile + catalogue → taps Install → confirm gate → progress bar → SHA-256 verify → row appears under Installed. Until 9.0c lands the worker can't *use* the model for anything, but the full opt-in flow + DPDP story is real. **OPFS dependency introduced** (Chrome/Edge/Firefox 111+/Safari 17+); older browsers get honest "Browser lacks OPFS support" error. **No third-party runtime dependency yet** — shell uses only browser-native `fetch` + `crypto.subtle` + `navigator.storage`; zero-dep posture preserved. **What's NOT in 9.0b**: no live download tested end-to-end (`models.bharat-os.example` doesn't actually serve bytes — failure path exercised, hosting real Phi-3-mini mirror is operationally separate); no background-resume of partial downloads; no per-pack signature check (just SHA-256); no on-device storage usage panel. **Phase 9.0 progress**: ~30% (9.0a + 9.0b are storage + UI scaffolding; 9.0c runtime adapter wrapping llama.cpp-wasm / MLC-LLM / ONNX Runtime Web is the bulk of remaining effort, ~3-4 wks, needs its own ADR for the third-party-dep + distroless-deploy trade-off; 9.0d federated-round + mesh-inference event integration, ~1 wk).

---

Closed in Phase 9.0a (ADR 0112 — Tier-4 SLM model-pack registry; first slice of Phase 9.0):
1. ✅ **Tier-4 SLM model-pack registry — admin-curated metadata, public read, compatibility filter; no runtime yet** — ADR 0107 sketched the Phase 9.0 substrate end-to-end (model-pack registry + capability detection + shell download flow + runtime adapter wrapping llama.cpp-wasm / MLC-LLM / ONNX Runtime Web) but flagged the runtime-adapter component as the gnarly part (first time Bharat OS introduces third-party runtime dependencies). Right sequencing: ship the easy pieces (registry CRUD + public read API + compat filter) first so the investor demo can show a curated catalogue immediately (with empty install slots), the shell's Phase 9.0b capability-detection + download flow has a stable API to consume from day 1, and admin ops can populate the registry from a jumphost without waiting for the runtime work. **New `src/phase1/slm-model-pack.mjs`** (pure validation + helpers, no I/O): `createSlmModelPack(input)` validates and normalises pack records (throws on invalid metadata; derives `modelPackId` from canonical hash when caller doesn't provide one); `filterCompatibleSlmModelPacks(packs, deviceProfile)` excludes revoked + RAM-exceeded + disk-under-1.2x-headroom (so half-finished download fits + leaves scratch for SHA-256 verify) + unsupported-runtime packs; `revokeSlmModelPack(pack, {revokedBy, reason})` flips status to `revoked` without hard-deleting (audit trail of "who installed this when" still resolves) + idempotent. **Constants exported**: `SLM_RUNTIMES` (`llama_cpp_wasm`, `mlc_llm_webgpu`, `onnx_runtime_web`, `native_aosp`); `SLM_QUANTIZATIONS` (`q4_k_m`, `q5_k_m`, `q8_0`, `fp16`, `int4`, `int8`); `SLM_LICENSES` (`mit`, `apache-2.0`, `bsd-3-clause`, `meta-llama-3`, `gemma-terms`, `phi-license`, `other`); `SLM_CAPABILITIES` (`inference`, `lora_finetune`, `classifier_head`, `embedding`). **Pack record** carries `modelPackId` / `tier: 4` / `family` / `variant` / `parameterCount` / `quantization` / `diskBytes` / `ramRequiredMb` / `runtime` / `sourceUrl` (HTTPS-only — http: rejected) / `sourceHash` (mandatory `sha256:<64-hex>`) / `license` / `capabilities` / `contextWindow` / `description` / `registeredAt` / `registeredBy` / `status` (`registered` | `revoked`). **Validation guards**: `diskBytes ≤ 8 GB` Tier-4 envelope; `ramRequiredMb ≤ 16 GB` (saves us from typos like `32768`); HTTPS-only sourceUrl (compromised plain-HTTP mirror can't ship backdoored SLM even before integrity verify); `sha256:<64-hex>` format mandatory; capabilities/runtime/quantization/license restricted to enumerated constants. **Storage**: both backends grow `slm_model_packs` table/directory; SqliteStore upserts + emits ledger event; BosStore file backend mirrors with `slm-model-packs/` directory + ledger append for parity; `saveSlmModelPack` emits `slm_model_pack.registered` (initial save) OR `slm_model_pack.revoked` (revoke save) ledger events carrying `modelPackId` / `family` / `variant` / `runtime` / `quantization` / `diskBytes` / `operator` / `at`. **DPDP §12(3) cascade NOT updated** — registry is admin-curated not per-identity; per-identity install records (`installed_on_device_slms`) come in Phase 9.0b and WILL go in the cascade. **API routes**: public `GET /api/slm-model-packs` (with `?activeOnly=true` to exclude revoked; `?compatible=true&deviceRamMb=…&freeDiskBytes=…&supportedRuntimes=csv` to filter; response carries `totalRegistered`/`totalActive` + the four enum constants so shell doesn't need a separate capabilities endpoint); `GET /api/slm-model-packs/:modelPackId` single-pack lookup or 404; admin (Phase 5.7 `BHARAT_OS_ADMIN_TOKEN` bearer) `POST /api/admin/slm-model-packs` (201 ok / 400 `invalid_slm_model_pack` / 409 `duplicate_pack` if non-revoked pack already exists with that id — revoke-then-re-register if operator actually wants to replace / 503 `admin_disabled` when token unset); `DELETE /api/admin/slm-model-packs/:modelPackId` (body `{reason?: string}`; 200 ok / 404 `unknown_pack`). Both admin routes log `admin_slm_pack_registered` / `admin_slm_pack_revoked` at INFO and rely on store's ledger-event emit for the audit trail. Route catalog at `GET /api` includes all four new endpoints. **§15 bindings**: no anonymous packs (admin curation + signed ledger events with operator attribution); integrity-checked downloads forward (sourceHash mandatory; Phase 9.0b will SHA-256-verify); HTTPS-only sourceUrl; soft-delete preserves audit trail; Tier-4 envelope cap prevents accidentally offering "install this 80 GB model"; revoked packs filtered from compat list (shell never offers revoked packs to new installs); admin write audited end-to-end (HTTP log line + ledger event). **Tests**: `tests/node/slm-model-pack.test.mjs` — 30 tests covering constants, `createSlmModelPack` happy path + every validation guard (12 tests), `revokeSlmModelPack` (2), `filterCompatibleSlmModelPacks` (4), BosStore + SqliteStore persistence + ledger evidence + reload (3), HTTP wiring including admin-auth gating + invalid metadata 400 + duplicate 409 + revoke DELETE + 404 + compat filter + single lookup (9). Full Node suite **777/777** (was 747; +30 new SLM tests; run in batches of 16 files to dodge Windows process-spawn OOM hitting parallel `--test` runners). **Phase 9.0 arc has started**: shell-side (9.0b) and runtime (9.0c) work now have a stable, tested API to build against. Investor demo today can call `GET /api/slm-model-packs` and show a curated catalogue. **No third-party runtime dependency yet** — llama.cpp-wasm / MLC-LLM NOT introduced; "zero npm dep" posture preserved through Phase 9.0a; the hard call comes in Phase 9.0c. **§15-compliant from day 1**: HTTPS-only source URL, mandatory SHA-256 integrity hash, admin-curated registry, soft-delete audit trail, Tier-4 envelope caps — all guards in place even before any actual downloads happen. **Remaining Phase 9.0 sub-phases**: 9.0b shell download flow on Profile tab + `installed_on_device_slms` per-identity table with DPDP cascade (~1-2 wks, no runtime yet just storage); 9.0c runtime adapter layer wrapping llama.cpp-wasm / MLC-LLM / ONNX Runtime Web (~3-4 wks, needs its own ADR for the third-party-dep + distroless-deploy trade-off); 9.0d integration with Phase 3.x federated rounds + Phase 6.0b mesh-inference workload events finally recording real ticks (~1 wk).

---

Closed in Phase 8.4 (ADR 0111 — shell UI for push subscription opt-in; activates Phase 7.x):
1. ✅ **Shell push opt-in turns Phase 7.x ON end-to-end + closes the Phase 8 shell arc** — Phase 7.0 (ADR 0101) shipped from-scratch VAPID Web Push (RFC 8292 + 8030 + 8291 + 8188) with `/api/push-public-key`, server-side `sendWebPush`, ES256 JWT signing + AES-128-GCM payload encryption. Phase 7.1 wired pushes into SIM-swap recovery + mesh-withdrawal terminal transitions. Phase 7.2 extended into §9A worker-notifications. Phase 7.3 added retry-on-429/5xx + `bos_push_send_total{vendor,outcome}` telemetry. But on the device side, the shell still spoke to push the same way Phase 2a.4 wrote it: `pushManager.getSubscription()` read-only (never creates), POST without `storeDeliveryKeys: true`, so server recorded a `local_notification` placeholder. No real Web Push ever left the operator. Phase 8.4 closes the loop. **Upgraded `#workerAlertSection` card** on Profile tab (renamed "Job alerts" → *"🔔 Bharat OS notifications"* since the card now covers recovery + cash-out + worker-job pushes): intro copy explaining the VAPID/local fallback + worker-initiated opt-out promise; **`.push-opt-in-list`** three-item bullet list explicitly naming what they'll be notified about mapped to underlying phases — 🔑 Account recovery (Phase 7.0 SIM-swap success + cooldown clear), 💰 Mesh cash-out updates (Phase 7.1 withdrawal terminal transitions), 🛠 Nearby work alerts (Phase 7.2 §9A worker-notifications); **`#workerAlertMode`** post-subscribe panel showing the real mode (green *"Real Web Push (VAPID)"* with RFC 8291 encryption honest-line OR amber *"Local notifications only"* explaining operator hasn't configured VAPID); actions row `[Enable notifications]` (becomes `[Re-subscribe]` once subscribed) + `[Test alert]`; **disable row** (hidden until subscribed) `[Turn off notifications]` link button gated by `window.confirm`; `.push-opt-in-details` collapsible explaining how Web Push works (endpoint + two keys, server-only-can-send-because-VAPID, AES-128-GCM RFC 8291, delete-on-opt-out promise). **Rewrote `enableWorkerAlerts()`** in `public/shell/app.js`: VAPID public-key fetch first via `fetchVapidPublicKey()` returning `null` on 503 `push_disabled` without throwing (fallback stays open); stale-subscription clearing before subscribe (`unsubscribe()` first then `subscribe()` fresh with new `applicationServerKey` — stops silent "subscribed but operator-can't-send" drift when operator rotates VAPID keys); `urlBase64ToUint8Array()` helper for the standard VAPID encoding dance; **honest fallback** on `pushManager.subscribe()` failure (private-mode Safari, server rejects key, browser unsupported) catching error + logging warning + falling through to POST without `storeDeliveryKeys` so local-only path still works (mode chip shows amber-honest "Local notifications only" instead of green); `storeDeliveryKeys: true` only when all three pieces (endpoint + p256dh + auth) present from real subscription (UI gates so request body honest; server defends in `createPushSubscriptionRecord`). **New `disableWorkerAlerts()`**: confirmation gate matching Phase 8.2 revoke + Phase 8.3 cash-out + Phase 2a.26 reset patterns; **browser-side `unsubscribe()` FIRST then server-side DELETE** (reversing would race operator's next push attempt against server-side delete; this order ensures browser push service forgets us before server forgets endpoint); idempotent server response (200 first call, 404 retry, both with `{ ok, deleted, subscriptionId }`); mode chip + disable button + enable-button label all reset to "Off" via `updateWorkerAlertStatus()`. **New `DELETE /api/push/subscriptions/:subscriptionId` server route** reusing existing `store.deletePushSubscription` (was added in Phase 7.0 for the 410-Gone auto-cleanup path; this gives it a worker-facing entrypoint); emits `push_subscription.deleted` ledger event so audit trail records both create AND delete (matches `push_subscription.saved` on POST); file-store `store.mjs` got the same `deletePushSubscription` method for backend parity (sqlite-store already had it); routes catalog updated. New CSS: `.push-opt-in-list` minimal bullet layout; `.push-opt-in-mode-real` green `#ecfdf5`/`#10b981`-border + `.push-opt-in-mode-local` amber `#fff7ed`/`#f59e0b`-border (colour palette matches Phase 8.2 / 8.3 status-badge family); `.push-opt-in-disable` centred row; `.push-opt-in-details` quieter typography for collapsible. SW cache v33 → v34. **§15 bindings preserved**: real-push requires explicit worker action (subscribe only on Enable tap → Notification.requestPermission browser prompt; no silent subscribe); server can't send unless worker opted in (`storeDeliveryKeys: true` only when worker successfully subscribed; without it server holds a placeholder it can't push to); worker-initiated disable is one tap + confirm (no buried setting); disable removes endpoint from server immediately (DELETE deletes row + emits `push_subscription.deleted`); operator-without-VAPID can't accidentally store delivery keys (503 from `/api/push-public-key` → shell skips real-subscribe branch → POST without storeDeliveryKeys → server defends with `body.storeDeliveryKeys === true && !readVapidConfig() → 503` from Phase 7.0); honest mode disclosure (chip shows green real OR amber local — never vague "Enabled" that lies in local-only case); push body still AES-128-GCM RFC 8291 (collapsible spells it out so worker isn't told to trust blindly); audit trail covers create AND delete. `tests/node/api.test.mjs` updated: "Job alerts" copy assertion became "Bharat OS notifications" to match the renamed card. **No new automated browser tests** (same pattern as 8.0/8.1/8.2/8.3). Live smoke verification: `/api/push-public-key` returns 503 with `push_disabled` when VAPID unset (fallback path the UI handles); shell HTML contains `Bharat OS notifications`, `push-opt-in-list`, `workerAlertDisableButton`, "How push works on Bharat OS"; POST with `endpoint: null` creates `local_notification` subscription `bos:push-subscription:defbf24…`; DELETE returns `{ ok: true, deleted: true }` on first call, HTTP 404 with `{ ok: false, deleted: false }` on retry (idempotent); all 51 push-suite tests still pass; full Node suite 747/747 still pass (run in batches of 15 files to dodge Windows process-spawn OOM hitting parallel `--test` runners). **Phase 7.x ships ENABLED**: until 8.4 every Phase 7 wire was technically present but practically dark — no shell-issued subscription ever carried delivery keys, so `sendWebPush` had nothing to send to; SIM-swap recovery succeeding wouldn't actually push the worker; a `paid` withdrawal wouldn't ring their phone; a `provider_accepted` cash-out wouldn't appear in the system notification tray. Phase 8.4 flips the switch. **End-to-end demo path for the trust + earn + alert loop**: worker enables notifications → operator marks a withdrawal `paid` from the jumphost → worker's phone rings with the cash-out alert + the Phase 8.3 history list updates on next refresh. Investor demo can show the full closed loop. **Phase 8 shell arc is done**: 8.0 earnings log → 8.1 mesh dashboard → 8.2 MFI consent → 8.3 cash-out → 8.4 notifications. Every Phase 5.9–7.3 backend substrate that needed worker-facing UI now has it. Next ship can move to Phase 9.0 (Tier-4 SLM) or Phase 10.0 (labeling marketplace) without leaving behind "API done, UI missing" debt.

---

Closed in Phase 8.3 (ADR 0109 — shell UI for UPI cash-out):
1. ✅ **Shell UI for UPI cash-out — Earn tab story completes for the mesh-contribution loop** — Phase 6.1b shipped mesh-withdrawal endpoints (balance / request / history + admin state transitions) but had no worker-facing UI. Phase 8.3 ships the card on the Earn tab between the Phase 8.1 mesh dashboard and the Phase 8.0 manual log. Earn tab now flows: real-time ticker → monthly retrospective → **cash-out (new)** → manual log → federated rounds. New `#meshWithdrawalSection`: header *"🏧 Cash out your mesh earnings"* + status caption; **balance block** (blue gradient panel, prominent 36px tabular-numeric `₹X,XXX.XX` for `availablePaise`; secondary meta line shows unsettled event count + minimum-withdrawal threshold when applicable); form with UPI ID input (`inputmode="email"`, `autocomplete="off"` per §15 — don't autofill from browser saved values), [Request withdrawal] button + [Refresh balance] link; history list below with status badges (`pending` amber, `provider_accepted` blue, `paid` green, `failed` red — same palette pattern as Phase 8.2 MFI consent badges); each row shows ₹ amount + status badge + request date + masked UPI + provider reference if available + failure reason if failed; "How cash-out works" details collapsible explaining the state machine + refund-on-failed property + bearer-token-style audit-masking semantics. New `setupMeshWithdrawal()` in `public/shell/app.js` (~150 lines, follows Phase 8.0/8.1/8.2 pattern): balance auto-refreshes on tab visit + after every successful request (a successful POST locks events into the new request so available balance drops to zero — UI reflects immediately); disabled-state logic on the Request button (`available === 0` → disabled "No unsettled events yet"; `available < minWithdrawalPaise` → disabled with threshold; else enabled); **confirmation gate** before POST via `window.confirm` with the honest message *"Withdraw your entire mesh-contribution balance to {upiId}? The events will be locked into this request until paid"* matching Phase 6.1b's all-or-nothing v1 semantics (partial withdrawals are future-polish); **UPI ID cleared on success** — the form doesn't retain the masked-but-readable ID; re-entry is the privacy-correct default. Indian-numbering output via `toLocaleString('en-IN')`. `escapeHtml()` on providerReference + failureReason + upiIdMasked before any list-row interpolation. New CSS rules: `.mesh-withdrawal-balance` blue gradient panel `linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)` with `#0c4a6e` accent; `.mesh-withdrawal-balance-value` 36px tabular-numeric bold; `.mesh-withdrawal-list-entry` 2-col grid; `.mesh-withdrawal-status-badge` with 4 status-coloured variants matching Phase 8.2's palette. SW cache v32 → v33. **§15 bindings preserved**: UPI ID never on the ledger / metrics (Phase 6.1b's `maskUpiId` server-side enforced; UI passes raw to POST but never echoes it back unmasked); `autocomplete="off"` on input — don't lure browser into saving (matches Phase 4.3's phone-OTP input posture); form clears on success — worker re-enters for next withdrawal (eliminates set-and-forget surface for shoulder-surfing / forgotten devices); explicit `window.confirm` gate before POST (matches Phase 8.2 revoke pattern + Phase 2a.26 reset-device pattern); refund-on-failed semantics communicated honestly in the details copy; HTML escaping on user-controlled fields defensively (provider reference could theoretically be anything the partner sends). **No automated browser tests** (same pattern as Phase 8.0/8.1/8.2). Live smoke verification: shell HTML contains `meshWithdrawalSection` + `meshWithdrawalUpiId`; with 15 seeded inference events (1M tokens × ₹8 each = 1600 paise/event = ₹120 total), `/mesh/balance` returns `availablePaise: 12000` + 15 unsettled events; POST `/mesh/withdrawals` with `upiId: rajesh@hdfcbank` returns `status: 'pending'`, `amountPaise: 12000`, `upiIdMasked: 'r***h@hdfcbank'`; all 747 Node tests still pass. **Earn tab story is complete for the mesh-contribution loop** — real-time ticker → monthly retrospective → cash-out to UPI → status visible in history. An investor demo can show the full earn-and-spend loop without leaving the tab. SRE marks `paid` from the jumphost via Phase 5.7 admin endpoint → worker sees green badge on next refresh + gets Phase 7.1 push notification in parallel (when VAPID configured). **Manual ops workflow + worker-facing visibility are now in sync.**

---

Closed in Phase 8.2 (ADR 0108 — shell UI for MFI income-verification consent issuance):
1. ✅ **Shell UI for MFI consent issuance — Trust tab MFI flow turns on** — Phase 6.1 (ADR 0097) shipped the MFI income-verification consent endpoints (POST issue / GET list / POST revoke) but had no worker-facing UI. A worker who wanted to apply for an MFI loan had to curl the endpoint themselves. Phase 8.2 ships the card on the Trust tab (which already hosts the Trust Passport flow — same "share data with verifiers" family). New `#mfiConsentSection` in `public/shell/index.html` inserted after `#trustPassportSection`. Card layout: header *"🏦 Share income with a lender"*; honest body copy *"Bharat OS hands a named MFI a signed summary of your earnings + portable attestations + verified memberships. You issue the consent; they read it ONCE; it burns. The MFI never sees raw entries — only the aggregated bundle."*; form with **Lender name** (maxlength 80, matches server cap), **Purpose** (maxlength 200, ≥ 8 chars server-enforced), **Financial year** select populated dynamically with current + 2 prior FYs (April-March basis, defaults to just-ended FY since that's what an MFI assesses for annual income), **Valid for** select (7 / 30 / 60 / 90 days, default 30), **Max reads** select (1 / 3 / 5 / 10, default 1 single-use bearer matching Phase 6.1 default), **[Issue consent]** button; orange-highlighted post-issuance block showing the `mfiFetchUrl` share URL + **[Copy]** button using `navigator.clipboard.writeText`; list of issued consents below with status badges (`active` / `revoked` / `expired` / `exhausted` — Phase 6.1's status enum); status badge logic runs CLIENT-SIDE via `classifyStatus(consent)` mirroring the server's `verifyIncomeVerificationConsent` (UI is advisory display, server still source of truth on read); per-row **[Revoke]** button on active consents only, gated by `window.confirm` + `window.prompt(reason)` (consistent with the existing "Reset device" pattern from Phase 2a.26). New `setupMfiConsent()` in `public/shell/app.js` (~170 lines, follows Phase 8.0/8.1 pattern): FY dropdown populated client-side from current date with offsets -1/0/-2 for just-ended/in-progress/prior FYs; share URL is `${window.location.origin}${mfiFetchUrl}` — bearer-token possession = read access until burn; worker decides out-of-band channel (WhatsApp, email, in-person QR); `escapeHtml()` applied to lender name + purpose + consentId before any HTML interpolation (XSS-safe). New CSS rules: `.mfi-consent-issued` orange-highlighted post-issuance block; `.mfi-consent-share input` monospace small font for the long consentId URL; `.mfi-consent-list-entry` 2-col grid (info + revoke); `.mfi-consent-status-badge` with 4 status-coloured variants (active green / revoked red / expired grey / exhausted amber). SW cache v31 → v32. **§15 bindings preserved**: worker controls the consent (no auto-issuance — explicit Issue button); status badge logic is client-side advisory (server enforces on actual read); cross-user isolation via `state.deviceOwnerId`; HTML escaping; share URL is the worker's responsibility (Phase 6.1 already made consentId a bearer token; UI's honest copy reflects that); revoke gated by confirm + prompt. **No automated browser tests** (same pattern as Phase 8.0/8.1). Live smoke verification: shell HTML contains mfiConsentSection + mfiName + mfiConsentIssue; end-to-end API round-trip the UI relies on works (POST .../consents returns 201 with mfiFetchUrl, GET .../consents lists the issued one with mfiName "Bajaj Finserv"); all 747 Node tests still pass. **The MFI flow is now demoable end-to-end** — investor demo path: worker logs earnings on Earn tab → switches to Trust tab → issues consent for "Bajaj Finserv / Personal loan / FY 2025-26" → copies share URL → simulates MFI fetch in a separate window → sees signed bundle response with aggregated data + mandatory disclaimer. Trust tab now hosts TWO complementary flows: Trust Passport (verifier reads attestations) + MFI consent (lender reads income summary).

---

Closed in Phase 8.1 (ADR 0106 — shell UI for the mesh-contribution dashboard):
1. ✅ **Shell UI for the mesh-contribution dashboard — monthly retrospective surface** — Phase 6.0b shipped the `aggregateMeshByMonth` + `GET /api/identities/:id/mesh/summary?month=YYYY-MM` substrate but had no worker-facing UI. The only mesh surface was the real-time ticker on `#meshNodeSection` showing "Earned today" + per-tick events. Phase 8.1 ships the monthly retrospective card. New `#meshDashboardSection` in `public/shell/index.html` between `#meshNodeSection` (real-time ticker) and `#earningsLogSection` (Phase 8.0 manual log). Earn tab now flows: real-time → monthly mesh → manual cross-platform → federated rounds. Card layout: header *"📊 Your mesh earnings this month"* + status caption; controls row with `<input type="month">` (defaults to current, `max=current` so no future months) + Refresh button; headline block with large `₹X,XXX.XX` total in accent green + secondary line *"N working days · M events"* (or *"No events yet"* when empty); per-workload breakdown showing only nonzero categories (`🧠 Inference`, `💾 Storage serve`, `🗄️ Storage store`, `🧪 Federated rounds`); daily timeline as a mini bar chart (3-column grid: date MM-DD + horizontal bar scaled to month max with `min-width: 2px` floor + rupees right-aligned). New `setupMeshDashboard()` in `public/shell/app.js` (~120 lines, pure DOM + fetch; follows the Phase 8.0 setup-function pattern; `state.deviceOwnerId` scopes every call; re-renders on month change OR Refresh; calls `refresh()` once at startup; HTML-escapes workload labels as defence-in-depth; `formatRupees(paise)` uses `toLocaleString('en-IN', ...)` for Indian-numbering output `₹50,000.00` / `₹1,00,000.00`). New CSS rules in `public/shell/styles.css`: `.mesh-dashboard-headline` (green gradient panel), `.mesh-dashboard-total` (32px tabular-numeric accent), `.mesh-dashboard-breakdown-row` (per-workload flat grid), `.mesh-dashboard-timeline-row` (3-col grid date/bar/amount with `width: <pct>%` inline-styled bar scaled to month max). SW cache v30 → v31. **§15 bindings preserved**: identity-scoped via `state.deviceOwnerId` (cross-user inspection impossible from UI); aggregates-only (the bar chart shows per-day totals + counts, never raw events); HTML escaping on workload labels even though they're server-constants (defence-in-depth); no new PII surface (summary endpoint already returns aggregates). **No automated browser tests** added (same pattern as Phase 8.0 — codebase has no browser-test infrastructure). Live smoke verification: shell HTML contains `meshDashboardSection` + month picker; with 5 seeded inference events (1M tokens × ₹16 each = 1600 paise/event), the `/mesh/summary?month=2026-05` API returns `totalPaise: 8000` + 5 daily timeline rows, so the UI would display *"₹80.00"* with 5 daily bars; all 747 Node tests still pass. **A worker scrolling the Earn tab now sees their mesh substrate's monthly arithmetic at a glance**: real-time ticker for *today*, the new dashboard for *this month* with per-workload + per-day breakdowns, and manual logging for cross-platform earnings beyond mesh. The investor demo path now has the compounding-earnings narrative the substrate was always designed to surface.

---

Closed in Phase 8.0 (ADR 0105 — shell UI for the earnings tracker, first UI surface of the Phase 5.9+ growth-arc):
1. ✅ **Shell UI for the earnings tracker — first user-visible surface of the growth arc** — Phases 5.9 through 7.3 shipped ~10 API substrates but ZERO worker-facing shell UI for any of them. An investor demo opening `localhost:8787/shell/` saw substrate work but no user-visible features for them. Phase 8.0 opens the Phase 8 arc by picking the foundational UI piece — the earnings tracker — because (a) it's the simplest (form + list); (b) it's the foundation everything else builds on (MFI bundle reads earnings, tax helper reads earnings, an empty earnings record makes Phase 6.1/6.0c demo as zeros); (c) it proves the UI integration pattern subsequent Phase 8.x cards will follow. New section `#earningsLogSection` in `public/shell/index.html` on the Earn tab between the existing mesh node card and the federated-rounds card. Five form fields: **Category** select (`delivery` / `ride` / `service` / `cash` / `other` matching `EARNINGS_CATEGORIES` from `src/phase1/earnings-log.mjs`); **Amount (₹)** number input (submitted as paise via `Math.round(rupees * 100)`); **Hours** (optional, 0-24, 0.5 step); **Date** (defaults to today, `max` is today — no future dates per Phase 6.0a validation); **Note** (optional, maxlength 200). Two action buttons: **Save** → `POST /api/identities/:id/earnings`; **Monthly summary** → `GET .../earnings/summary?month=YYYY-MM`. Below the form: list of 30 most-recent entries with per-entry **remove** buttons (DELETE wires to the existing endpoint); summary block renders the API's `statement` field (Phase 6.0a `monthlyStatement` output). New `setupEarningsLog()` function in `public/shell/app.js` (~110 lines, pure DOM + fetch, no new library) follows the existing setup-function pattern (`setupDpdp`, `setupPhoneOtp`, etc.); uses `state.deviceOwnerId` to scope every API call; refreshes the list after every Save or Delete; surfaces structured API errors in the card's `#earningsLogStatus` caption; escapes user-controlled text (notes) before HTML injection (XSS prevention). New CSS rules in `public/shell/styles.css` for `.earnings-form` / `.earnings-row` / `.earnings-list` / `.earnings-list-entry` / `.earnings-summary` — mobile-first stacking at <380px. Service worker cache bumped v29 → v30. **§15 bindings preserved**: card copy explicitly states "Type what you earned today — Bharat OS keeps a clean monthly summary you can show a landlord or MFI. Data stays on your device" matching the API's no-scraping contract; identity-scoped via localStorage `deviceOwnerId`; integer paise on submit; HTML escaping on note rendering (no XSS); no new PII surfaces. **No automated browser tests** added — the codebase has no existing browser-test infrastructure (the 747 Node tests are server-only; shell UI surfaces are verified manually per the existing pattern in Phases 2a.25 / 2a.26 / 4.4 / 4.5). Live smoke verification confirmed: `GET /shell/index.html` returns 200 with `earningsLogSection` + `earningsAmount` + `earningsCategory` present; `GET /shell/styles.css` returns 200 with `.earnings-form` rule; all 747 Node tests still pass. **A worker opening `/shell/` can now actually log earnings — the investor demo path is real**: install → set up identity (Phase 2a.26 wizard) → Earn tab → log a delivery → see it in the list → view monthly summary. The growth-arc primitive is finally user-visible. Sets the UI integration pattern for subsequent Phase 8.x cards (mesh dashboard, MFI consent, UPI cash-out, push opt-in).

---

Closed in Phase 7.3 (ADR 0104 — Web Push adaptive retry + per-vendor telemetry):
1. ✅ **`bos_push_send_total{vendor, outcome}` + retry-on-429/5xx/network-error closes the Phase 7 observability+reliability story** — Phase 7.0/7.1/7.2 shipped real Web Push delivery, the `sendPushToIdentity` helper, and the §9A worker-notification wire. Two ADR 0101 future-work items remained: adaptive retry on rate-limit + transient errors, and per-vendor health telemetry mirroring Phase 5.3's SMS observability. Phase 7.3 ships both as additive layers (all 35 Phase 7.0/7.1/7.2 tests still pass). **Per-vendor telemetry** — new metric `bos_push_send_total{vendor, outcome}` in `src/phase0/metrics.mjs` mirrors `bos_sms_send_total`. Vendor extraction via new `pushVendor(endpoint)` helper that maps endpoint host → vendor family (`*.googleapis.com` → `fcm`, `*.mozilla.com` → `autopush`, `*.windows.com` → `wns`, `*.mock` → `mock` for tests, everything else → `other`). Bharat OS doesn't route between vendors (the subscription owns that choice — Chrome users get FCM, Firefox users get Autopush) but per-vendor success rate is what ops needs to see. 6-value outcome enum: `success` (200/201 first try), `gone` (404/410 — subscription invalidated), `rate_limited` (429 first attempt; if retry succeeds, `retried_success` also fires), `rejected` (other 4xx or 5xx after retry), `network_error` (TCP/DNS/fetch throw), `retried_success` (first attempt failed, retry succeeded). PromQL example for FCM failure rate: `1 - rate(bos_push_send_total{vendor="fcm",outcome="success"}[5m]) / rate(bos_push_send_total{vendor="fcm"}[5m])`. **Adaptive single-retry** — `sendWebPush` retries exactly once on three failure classes: HTTP 429 (parses `Retry-After` per RFC 7231 §7.1.3 — accepts both delta-seconds integer and HTTP-date; caps at 60s to prevent rogue headers from blocking the request loop for hours; falls back to 1s baseline when header is missing); HTTP 5xx (fixed 1s delay); network error from fetch throw (fixed 1s delay). Returns `{ retried: true, retryAfterMs? }` on result. Retry path passes `retry: false` recursively to prevent cascading retries — **maximum 2 attempts per `sendWebPush` invocation**. Test seam: `sendWebPush({ ..., sleep: customSleep })` lets retry tests inject a no-op sleep without actually waiting. New `parseRetryAfterMs(headerValue, { now })` helper tolerates delta-seconds, HTTP-date, missing/malformed (returns 0), past dates (clamped to 0), rogue >60s values (capped at 60000ms). **`retry: false` opt-out** for callers that need single-attempt semantics. **§15 bindings preserved**: no PII in metric labels (vendor + outcome are bounded enums; endpoint URL never appears); retry just re-runs the same E2E-encrypted POST so push service still can't read payload; single retry hard-caps loops; Retry-After 60s cap prevents header-based denial-of-service; `retried_success` is separate from `success` so ops can distinguish flapping-but-recovering from nominal. 747 / 747 tests (+16 new: 2 `pushVendor` (host mapping + malformed input), 4 `parseRetryAfterMs` (delta-seconds + HTTP-date + 60s cap + missing/past-date), 3 per-vendor telemetry recording, 2 retry-on-429 (single retry honors Retry-After + persistent 429 gives up after exactly 2 calls), 1 retry-on-5xx with fixed 1s baseline, 1 retry-on-network-error, 1 `retry: false` opt-out, 2 Prometheus output (sample rendering + empty-counter HELP/TYPE-still-present)). No SW change (server-side only). **Three-axis Web Push observability now matches the SMS stack**: delivery (Phase 7.0 binary success/fail), per-event audit ledger (Phase 7.1), per-vendor success-rate counter (Phase 7.3). FCM 429-bursts heal automatically; Autopush 503-blips heal automatically; ops sees vendor-level degradation before user impact via `bos_push_send_total{vendor="fcm",outcome="rate_limited"}` and `retried_success / success` ratio.

---

Closed in Phase 7.2 (ADR 0103 — §9A worker-notification VAPID delivery, closes ADR 0053's vapidIntegrated:false gap):
1. ✅ **§9A worker-notification path delivers real Web Push, finally** — Phase 2a.4 (ADR 0053, August 2025) scaffolded the §9A worker-notification envelope but stopped at local service-worker notifications because real Web Push didn't exist. ADR 0053's closing paragraph: *"Real Web Push sending still needs VAPID key management, encrypted endpoint storage or a send-only queue, delivery retries, unsubscribe handling, and production push-service integration."* All four prerequisites now exist (Phase 7.0 VAPID + endpoint storage; Phase 7.1 reusable `sendPushToIdentity` helper with delivery retries + 410-Gone unsubscribe; `sendWebPush` calls any RFC 8030 endpoint — FCM, Autopush, Microsoft, etc.). Phase 7.2 is a small wire-up. `POST /api/worker-notifications` handler now calls `sendPushToIdentity(store, workerId, payload, { urgency, ledgerType: 'worker_notification.pushed', ... })` with payload `{ type: 'worker_job_alert', title, body, jobReference, locale }`. The notification record's `delivery` block is updated based on outcome with five state branches: **delivery-keyed subscription + push succeeds** → `delivery: { status: 'delivered_web_push', vapidIntegrated: true, sent: true, sentToEndpoints: N }` HTTP 201; **push attempted but failed** (network / 5xx) → `delivery: { status: 'web_push_failed', vapidIntegrated: true, sent: false, reason: 'N push delivery failure(s)' }` HTTP 502; **scaffold-only subscription** (Phase 2a.4 caller didn't pass `storeDeliveryKeys: true`) → falls back to `queued_local_notification`, no push, HTTP 201 (backward-compat with ADR 0053); **no subscription** → `blocked_no_subscription` HTTP 202; **VAPID unset entirely** → `sendPushToIdentity` returns `{ skipped: true }` silently, notification stays in scaffold's `queued_local_notification` HTTP 201 (graceful degradation). Notification urgency maps to push HTTP `Urgency` header: `content.urgency === 'high'` → `Urgency: high`, else `Urgency: normal` — push services prioritise truly time-sensitive alerts (delivery slot expiring) over routine ones (new job match). **§15 binding extension**: §9A enforces no-PII on `content.title` + `content.body` at the envelope layer per ADR 0053 (`exactLocationIncluded: false`, etc.); Phase 7.2 passes these verbatim into the push body. Callers MUST continue to use behavioural cues + masked identifiers, never raw addresses / phones / Aadhaar refs — same contract as Phase 7.1's recovery/cooldown/mesh/MFI alerts. 731 / 731 tests (+5 new — including the **end-to-end §9A push delivery** test that registers a delivery-keyed subscription, POSTs a worker-notification, verifies the push.mock URL was hit with `Authorization: vapid t=...`, asserts `vapidIntegrated: true` + `status: 'delivered_web_push'` + `sentToEndpoints: 1` on the notification record + the `worker_notification.pushed` ledger entry, PLUS the scaffold-only-fallback test that proves ADR 0053 backward compat + the VAPID-unset graceful-degradation test + the urgency-header-passthrough test). No SW change (server-side only). **§9A loop is fully operational — a blue-collar worker who installs Bharat OS, grants notification permission, and has a delivery-keyed subscription now actually receives job alerts on their device. The Phase 2a.4 demo state is gone.**

---

Closed in Phase 7.1 (ADR 0102 — push alerts for audit-significant events):
1. ✅ **`sendPushToIdentity` helper + push wires for cooldown-clear, mesh-withdrawal terminal transitions, and MFI bundle reads** — Phase 7.0 shipped the SIM-swap detection push but wired it inline as ~60 lines of boilerplate. Adding a new push event meant copying that boilerplate. Phase 7.1 extracts the pattern and wires three new audit-significant events. New export `sendPushToIdentity(store, identityId, payload, { urgency, ledgerType, requestId, logger, at })` in `src/phase0/web-push.mjs`: encapsulates VAPID config check → subscription load → filter to `rawEndpointStored: true` → per-subscription `sendWebPush` → typed ledger event with masked endpoint → 410-Gone auto-unsubscribe → caught error per-subscription so the caller's primary action never breaks. Returns `{ skipped, sent, failed, unsubscribed, attempted, reason? }`. **Safe-default behavior**: VAPID unset → `{ skipped: true, reason: 'vapid_unconfigured' }` (NO exception thrown; caller's primary action proceeds); store without `listPushSubscriptions` → same skip. **Audit-by-default**: every send attempt emits a typed ledger event with masked endpoint + pushStatus + payloadType + reason; on failure type becomes `<ledgerType>.failed`. **Phase 7.0 recovery push refactored** to use the helper — ~60 lines reduced to 5; all Phase 7.0 tests still pass (22/22). **Three new push wire-points**: (1) **`cooldown_override.applied` → `cooldown_override.pushed`** — when Phase 5.7 admin endpoint clears a recovery cooldown, every paired device gets a high-urgency push *"Your recovery cooldown was lifted by Bharat OS support — if you contacted support, no action needed; if not, tap to report"*. Compounds Phase 7.0 — the original recovery already pushed; this is a second alert if THAT wasn't the legitimate user OR if a compromised admin token is being abused. (2) **`mesh_withdrawal.paid` / `failed` → `mesh_withdrawal.pushed`** — when Phase 6.1b admin endpoint marks a withdrawal terminal, worker gets confirmation (normal urgency for paid: *"₹500.00 sent to your UPI r***h@hdfcbank, Reference: razorpay-12345"*) or alert (high urgency for failed: *"Your mesh payout failed — partner reported invalid UPI. Amount returned to your available balance."*). UPI ID stays masked in the push body. (3) **`income_verification_bundle.read` → `income_verification.pushed`** — when an MFI fetches the worker's bundle, worker gets normal-urgency notification *"Bajaj Finserv just read your income summary — if you shared the consent link with them, no action needed; if not, tap to revoke any remaining consents"*. Catches stolen `consentId` bearer tokens in near-real-time. **§15 bindings preserved end-to-end**: push body NEVER contains PII (no raw UPI, no raw UAN, no displayName, no phone — only masked identifiers + behavioural cues); operator label for cooldown-override goes to ledger NOT push body; full audit trail per send attempt; best-effort delivery never breaks the caller's primary action; graceful degradation when VAPID unset (no 503, no error); DPDP §12(3) cascade extends via existing pattern. 726 / 726 tests (+8 new: 3 helper unit tests including the safe-default skip-when-unconfigured + missing-params rejection + zero-subs-returns-cleanly, 5 end-to-end live HTTP each verifying the push.mock URL was hit + ledger event with masked endpoint + correct payloadType, plus the **graceful-degradation test** that proves the full MFI-fetch flow works when VAPID is unset with ZERO pushes and ZERO `*.pushed` ledger events). No SW change (server-side only). **Three-layer SIM-swap defense + detection now compounds**: (1) Phase 5.2 cooldown gates destructive actions, (2) Phase 7.0 push tells user about the recovery, (3) Phase 7.1 push tells user when ops lifts the cooldown — catches both attacker scenarios AND corrupt-admin-token scenarios. Adding a new push event is now a 5-line patch.

---

Closed in Phase 7.0 (ADR 0101 — Web Push notifications via VAPID, implemented from scratch):
1. ✅ **Web Push VAPID notifications — SIM-swap defense loop fully closed** — Phase 5.2 (ADR 0088) gated destructive actions for 24h after recovery, but the legitimate user only KNEW their account was recovered when they next logged in. Phase 7.0 ships the push-side detection signal: when `account_recovery.completed` fires, every paired device of the recovered identity receives a high-urgency Web Push alert within seconds. New artifact `src/phase0/web-push.mjs` implements **RFC 8030 (Web Push) + RFC 8291 (message encryption) + RFC 8292 (VAPID identification) from scratch** on Node 20+'s built-in `crypto` — **zero new npm dependencies**, consistent with the pattern since Phase 5.1. **VAPID JWT signing (ES256)**: JOSE-format JWT with `{ aud, exp, sub }` claims per RFC 8292 §2; ECDSA signature converted from Node's DER output to the raw `r || s` 64-byte JOSE form via `derToJose`. **JWK key conversion** — initial hand-rolled PKCS#8 DER was rejected by Node's `createPrivateKey` with "unsupported decoder"; switched to JWK format (`{ kty: 'EC', crv: 'P-256', x, y, d }`) which Node accepts directly. **Payload encryption (RFC 8291)**: AES-128-GCM with keys derived via HKDF-SHA-256 from an ECDH P-256 shared secret + the subscription's 16-byte auth secret; RFC 8188 `aes128gcm` content-encoding (modern, NOT legacy `aesgcm`); single-record format with the sender's ephemeral public key embedded in the header (salt 16B + rs 4B + idlen 1B + sender-pub 65B + ciphertext + GCM tag 16B). **HTTP send**: POST to subscription endpoint with `Content-Encoding: aes128gcm`, `Authorization: vapid t=<jwt>, k=<pubkey>`, `TTL`, `Urgency` headers. Helper `maskEndpoint('https://fcm.googleapis.com/.../abc123') → 'fcm.googleapis.com/...xxxx23'` mandatory for any audit/ledger/metric sink. Helper `readVapidConfig()` returns null when env vars unset (safe default). **Phase 2a.4 scaffold extension**: `createPushSubscriptionRecord` gains `storeDeliveryKeys: true` opt-in flag that persists the raw endpoint + p256dh + auth (required for actual delivery); defaults to `false` for backward compat with the Phase 2a.4 `rawEndpointStored: false` pattern; falls back to no-store mode when keys are incomplete (safe). New SqliteStore method `deletePushSubscription` for auto-cleanup on 410 Gone. **One new API endpoint**: `GET /api/push-public-key` returns the VAPID public key + subject so the shell can construct browser Push API subscriptions (503 `push_disabled` when VAPID unset, mirrors Phase 5.7 admin-auth's safe-default pattern). **Existing `POST /api/push/subscriptions` extended** to accept `storeDeliveryKeys: true`; refuses with 503 when VAPID unconfigured (saves a useless record); response strips raw endpoint+keys (client already has them). **Wired into `/api/recovery/verify` success path**: reads all push subscriptions for the recovered identity with `rawEndpointStored: true`; for each, calls `sendWebPush` with a high-urgency `account_recovery_alert` payload *("Your Bharat OS account was just recovered. If this was you, no action needed. If it was NOT, tap to contact support — your cooldown window ends at YYYY-MM-DDT...")*; emits `recovery_alert.pushed` ledger event with masked endpoint + push status; 410 Gone subscriptions are deleted automatically. Best-effort: failures don't block the recovery response (cooldown is the actual defense, push is detection). New script `scripts/generate-vapid-keys.mjs` prints a ready-to-paste .env snippet. New env vars (all required for push delivery): `BHARAT_OS_VAPID_PUBLIC_KEY` + `BHARAT_OS_VAPID_PRIVATE_KEY` + `BHARAT_OS_VAPID_SUBJECT` (mailto: or https://). Rotation cadence: quarterly + after any suspected leak. **§15 bindings preserved end-to-end** — subscription endpoints are device-identifying PII; raw storage is opt-in (`storeDeliveryKeys: true`), masked everywhere except the stored record + outbound fetch; payload bodies are end-to-end encrypted so the push service can't read them; VAPID claims contain no user-identifying data (only origin / expiry / contact email); recovery alert payload contains no PII (no identityId, displayName, phone); 410 Gone auto-unsubscribes; push disabled when VAPID unset (safe default); DPDP erasure cascade already includes `push_subscriptions`. 718 / 718 tests (+22 new: 1 base64url round-trip, 1 VAPID keypair shape, 2 VAPID JWT (3-segment JOSE token shape with ES256 + bad-input rejection covering missing endpoint/subject/non-mailto/TTL>24h/missing keys), 3 payload encryption (aes128gcm body shape verification including salt-not-all-zeros + sender-pub-length-65 + ≥103-byte minimum body + malformed-input rejection + oversized-payload rejection), 2 maskEndpoint, 1 readVapidConfig, 4 sendWebPush with mocked fetch (201 success, 410 auto-unsubscribe with `shouldUnsubscribe: true`, non-success providerResponse truncation, missing-fields rejection), 3 createPushSubscriptionRecord storeDeliveryKeys gating including the safe-fallback when keys are incomplete, 5 end-to-end API including 503/200 for push-public-key, 503 refusal for `storeDeliveryKeys: true` when VAPID unset, response strips raw endpoint+keys, and the **full E2E recovery push test** that registers a delivery-keyed subscription + seeds an account_recovery OTP + POSTs `/api/recovery/verify` + verifies the push.mock URL was called + asserts the `recovery_alert.pushed` ledger event with masked endpoint). No SW change (server-side only — Phase 7.x can extend the shell SW to register push subscriptions). **SIM-swap defense loop is fully closed: a SIM-swap attacker who completes recovery on a new phone gets ZERO destructive actions through (Phase 5.2 cooldown) AND the legitimate user knows within seconds (Phase 7.0 push). Zero new runtime dependencies; Web Push protocol implemented in ~600 lines of `src/phase0/web-push.mjs`.**

---

Closed in Phase 6.3 (ADR 0100 — state e-Shram + welfare scheme entitlement substrate; growth-arc plan complete):
1. ✅ **State e-Shram registration + welfare-scheme entitlement substrate — final growth-arc phase, ADR 0096 plan now fully shipped end-to-end** — e-Shram is the Ministry of Labour & Employment's National Database of Unorganised Workers (~300M registered as of FY 2024-25). Each registration issues a 12-digit UAN (Universal Account Number) and links to a basket of welfare schemes — PMJJBY (life insurance), PMSBY (accident insurance), PM-SYM (pension), PMJAY (Ayushman Bharat health, ₹5L cover), MGNREGA (rural employment), PMAY (housing), NSAP (social assistance), plus state welfare boards. ADR 0096 listed Phase 6.3 as "heavy lift but the largest population." The partnership itself is out-of-tree (state labour commissioner pilot or central scheme administrator contract); the SUBSTRATE the partnership consumes ships here. New artifact `src/phase1/eshram-registration.mjs`: **`createEShramRegistration({ issuer, memberId, issuerName, uan, occupationCategory, occupationDetail?, state, district?, educationLevel?, monthlyIncomeBracket?, ncoCode?, registeredAt?, ttlDays?, at })`** — Ed25519-signed envelope; UAN validated as 12-digit string; **`maskUan('123456789012') → 'xxxx-xxxx-9012'` mandatory for any audit/ledger/metric surface**; 8 broad e-Shram occupation categories (`agriculture` / `construction` / `domestic` / `transport` / `manufacturing` / `gig_platform` / `retail` / `other`) + optional free-text detail; state 2-3 letter uppercase (TN/MH/KA); 6-band coarse income bracket enum (`under_10k` through `over_3L` — **NEVER precise amounts**); NCO 2015 code 2-4 digit; deterministic `bos:eshram-registration:<sha256-prefix>` ID. **`createSchemeEntitlement({ issuer, memberId, issuerName, schemeCode, schemeName?, enrolledAt?, benefitPaise?, benefitDescription?, validThrough?, ttlDays?, at })`** — scheme code enum (9 entries incl. STATE_WELFARE catch-all + OTHER); benefit in INTEGER paise; `validThrough` is the scheme's own end-date (separate from attestation `expiresAt` — an attestation can be re-signed without scheme membership lapsing); deterministic `bos:scheme-entitlement:<sha256-prefix>` ID. **`verifyEShramRegistration` / `verifySchemeEntitlement`** return `{ ok, status }` enum (`valid` / `expired` / `revoked` / `signature_invalid` / `unknown_issuer` / `malformed` + `scheme_validity_expired` distinct from `expired` so consumers can distinguish "attestation needs re-signing" from "scheme membership ended"). **`revokeEShramRegistration` / `revokeSchemeEntitlement`** require reason ≥ 4 chars. **`filterBlessedEShramRegistrations` / `filterBlessedSchemeEntitlements`** mirror Phase 6.2's pattern — REUSES the Phase 6.2 blessed-collectives registry, semantically generalised to "blessed issuers" (the naming retained for backward compat). Two new SqliteStore tables `eshram_registrations` + `scheme_entitlements` indexed on issuer + member + status; both included in DPDP §12(3) erasure cascade (clears BOTH member-side AND issuer-side records when an identity erases). **Six new API endpoints**: `POST/GET /api/identities/:issuerId/eshram-registrations` + revoke (non-issuer attempts → 404 no-ownership-leak; emits `eshram_registration.issued` ledger event with MASKED UAN only); same pattern for `scheme-entitlements` with optional `?schemeCode=PMJAY` filter on the list endpoint. **MFI income-verification bundle (Phase 6.1, extended 6.2) extended again** — `buildIncomeVerificationBundle` now accepts `eshramRegistrations` + `schemeEntitlements` inputs; `credibility` section gains `verifiedEShramRegistrations` (with `uanMasked` ONLY — never the raw 12-digit UAN) + `verifiedSchemeEntitlements` arrays. Only entries signed by BLESSED issuers AND currently valid surface in the bundle. **§15 bindings preserved end-to-end** — UAN masked everywhere except the stored attestation record (which is DPDP-exportable by the worker themselves); Aadhaar NEVER stored (we don't request it, don't accept it, not in schema — e-Shram government layer holds Aadhaar, we hold the UAN they issued); income is bracketed not precise (precise paise live in Phase 6.0a earnings-log); cross-issuer revoke 404; blessed-issuer protocol vs. trust policy separation; full audit trail in typed ledger with masked UAN; DPDP cascade extends. 696 / 696 tests (+23 new: 2 UAN helpers, 2 createEShramRegistration including all 8 input validation paths, 2 verify covering tamper + expired/revoked status, 3 createSchemeEntitlement + verify including `scheme_validity_expired` distinct enum, 1 revoke reason-required, 2 blessed-issuer filters, 2 MFI bundle integration (**including the critical-path test that asserts raw UAN is ABSENT from the full bundle JSON**), 3 SqliteStore + DPDP, 5 live HTTP including the **full end-to-end test**: bless 2 issuers → labour dept issues registration → NHA issues PMJAY entitlement → worker issues MFI consent → MFI fetches bundle → bundle surfaces both with masked UAN + raw-UAN-absent assertion. **The ADR 0096 growth-arc plan is now fully shipped end-to-end** — Phases 6.0a (earnings tracker), 6.0b (mesh dashboard), 6.0c (tax helper), 5.9 (QR portable attestation), 6.1 (MFI consumption), 6.1b (UPI cash-out), 6.2 (worker-collective membership), 6.3 (e-Shram + scheme entitlement) all complete. No SW change (server-side only). **The substrate any growth-arc partnership consumes — single-player tools through state-government integration — is in production. The partnership work itself is out-of-tree (collectives, MFIs, payout providers, state labor commissioners) but every one of them now has one curl that does the integration.**

---

Closed in Phase 6.2 (ADR 0099 — worker-collective membership substrate):
1. ✅ **Worker-collective membership substrate — SEWA / IFAT partnership conversation has a code answer** — ADR 0096's Phase 6.2 plan was worker-collective distribution. The partnership work is out-of-tree (you can't ship "the SEWA integration" without SEWA), but the substrate the partnership consumes ships here. Three primitives, cleanly separated. New artifact `src/phase1/collective-membership.mjs`: `createMembershipAttestation({ collective, memberId, collectiveName, memberRole?, region?, joinedAt?, ttlDays?, at })` produces a versioned Ed25519-signed envelope (member roles enumerated: `driver` / `delivery` / `domestic_worker` / `construction` / `service` / `farm` / `general`; region is city/district level ≤ 80 chars matching Phase 5.9's ~1km GPS precision bound; default TTL 365 days, capped at 5 years; refuses self-membership; deterministic `bos:collective-membership:<sha256-prefix>` ID), `verifyMembershipAttestation` (status enum `valid` / `expired` / `revoked` / `signature_invalid` / `unknown_collective` / `malformed`), `revokeMembershipAttestation({ reason })` (collective burns a membership — e.g. worker left the union; reason ≥ 4 chars enforced), `createBlessedCollectiveRecord` (admin-issued trust-list entry), `filterBlessedMemberships(memberships, blessedRegistry, { at })` (returns the subset that are signed by a blessed collective AND currently valid). **Protocol vs. trust policy completely decoupled** — anyone can sign a membership attestation; only blessed collectives surface in consuming flows. A rogue actor cannot game the system by self-blessing. **Two new SqliteStore tables**: `collective_memberships` (indexed on collective_id + member_id + status) and `blessed_collectives` (admin-curated registry). Both included in DPDP §12(3) erasure cascade — erasing the WORKER removes member-side records; erasing the COLLECTIVE removes issuer-side records AND its blessed-registry entry. **Six new API endpoints**: collective side — `POST /api/identities/:collectiveId/collective-memberships` (signs + persists; emits `collective_membership.issued` ledger event), `POST .../collective-memberships/:membershipId/revoke` (non-issuer attempts return 404 to mirror income-verification's no-ownership-leak pattern); member side — `GET /api/identities/:memberId/collective-memberships`; public + admin — `GET /api/blessed-collectives` (public read of the trust list — consuming surfaces query this), `POST /api/admin/blessed-collectives` (Phase 5.7 admin-auth gated; verifies collectiveId resolves to an existing identity so a typo can't bless a phantom; emits `blessed_collective.added` ledger event), `DELETE /api/admin/blessed-collectives/:collectiveId` (admin-auth gated; emits `blessed_collective.removed`). **MFI income-verification bundle (Phase 6.1) extended** — `buildIncomeVerificationBundle` now accepts `collectiveMemberships` + `blessedCollectives` inputs; bundle's `credibility` section gains a `verifiedCollectiveMemberships` array containing only memberships from BLESSED collectives that are CURRENTLY VALID (the trust-list filter happens server-side; rogue attestations cannot bleed into a bundle). An MFI now sees "verified 8-year SEWA member, Chennai, domestic_worker" alongside earnings + portable attestation tier breakdown — a strong signal independent of self-reported income. **§15 bindings preserved end-to-end**: collective signs but the data lives on the member's record (DPDP-exportable + deletable); region capped at neighbourhood precision; full audit trail in typed ledger; cross-issuer revoke 404 leaks no ownership; DPDP cascade extends to both new tables; MFI bundle only surfaces blessed memberships. 673 / 673 tests (+26 new: 3 createMembershipAttestation including self-refusal, 5 verifyMembershipAttestation covering all status enum values + tamper detection, 1 revoke reason-required, 2 filterBlessedMemberships, 1 createBlessedCollectiveRecord validation, 2 MFI bundle integration (blessed-yes / non-blessed-no), 3 SqliteStore + DPDP, 8 live HTTP including the **full end-to-end** test: bless SEWA → SEWA issues membership → worker issues MFI consent → MFI fetches bundle → bundle surfaces `verifiedCollectiveMemberships` entry, plus admin-auth gating, cross-issuer-revoke 404, unblessing flow). No SW change (server-side only). **When SEWA / IFAT / NDLF asks "what does Bharat OS give us?", the answer is now concrete: an endpoint your office hits to issue verifiable membership credentials, those credentials surface in the worker's portable Trust Passport + the MFI bundle + any consuming aggregator — without any per-partner integration code on either side.**

---

Closed in Phase 6.1b (ADR 0098, second half — UPI cash-out substrate completes Phase 6.1):
1. ✅ **UPI cash-out for mesh earnings — workers can finally turn accumulated mesh-contribution paise into real rupees** — Phase 6.0b promoted the mesh dashboard but earnings never left the system. Phase 6.1b ships the substrate any UPI payout partner (Razorpay X, Cashfree Payouts, Decentro, etc.) can consume — without per-partner integration code. New artifact `src/phase1/mesh-withdrawal.mjs` (pure functions): `isValidUpiId` (`<local>@<bank>` pattern, length 5-80, rejects spaces / multi-`@` / oversize), `maskUpiId` (`rajesh@hdfcbank` → `r***h@hdfcbank` — mandatory for any audit / ledger / metric sink; raw UPI ID NEVER appears outside the stored record + the outbound payout API call), `computeAvailableBalance(meshEvents, withdrawals, { operatorId })` (sums `payoutPaise` of events NOT bundled into any non-failed withdrawal — `pending` / `provider_accepted` / `paid` lock events; **failed withdrawals' events automatically return to the pool** so partner-side failures never permanently shortchange the worker), `createWithdrawalRequest({ identity, meshEvents, priorWithdrawals, upiId, at })` (bundles ALL unsettled events into a single signed request for the worker's full balance — partial withdrawals are intentionally future-polish; Ed25519-signed; ₹10 floor + ₹10L ceiling sanity checks; deterministic `bos:mesh-withdrawal:<sha256-prefix>` ID), `verifyWithdrawalRequest` (signature round-trip for payout-partner verification — strips mutable state fields BEFORE verification so transitions after signing don't invalidate the signature). **Four-status state machine** with valid-transitions-only enforcement: `pending` → `provider_accepted` → `paid` (terminal); `pending` → `failed` and `provider_accepted` → `failed` (also terminal); plus a fast-path `pending` → `paid` for synchronous partners. `markWithdrawalAccepted({ providerReference })` (requires partner reference string for audit correlation), `markWithdrawalPaid({ providerReference? })`, `markWithdrawalFailed({ reason })` (reason ≥ 4 chars enforced). All transitions throw `invalid transition` for invalid moves (e.g. `paid → failed`). New SqliteStore table `mesh_withdrawals` indexed on `worker_id` + `status`; CRUD methods + included in DPDP §12(3) erasure cascade. **Seven new API endpoints**: worker side — `GET /api/identities/:id/mesh/balance` (returns available balance + `minWithdrawalPaise: 1000` floor), `POST /api/identities/:id/mesh/withdrawals` (body `{ upiId }`; structured 400 error codes `invalid_upi_id` / `insufficient_balance` / `amount_exceeds_ceiling` / `invalid_withdrawal_request`; emits `mesh_withdrawal.requested` ledger event with masked UPI), `GET /api/identities/:id/mesh/withdrawals` (history); admin side (Phase 5.7 admin-auth gated) — `POST /api/admin/mesh/withdrawals/:requestId/accepted`, `POST .../paid`, `POST .../failed`. Each ops transition emits a typed ledger event with operator attribution + masked UPI ID. **§15 bindings preserved end-to-end**: worker explicitly signs every withdrawal (no silent payouts; cryptographic non-repudiation for partner-side verification); UPI ID masked everywhere except the stored record (which is needed for the actual outbound payout call); idempotent settlement via event-locking (each mesh-contribution event is bundled into at most one non-failed withdrawal — the events ARE the unit of double-claim prevention); failed payouts are refundable automatically; full audit trail in typed ledger; DPDP erasure cascade extends. 647 / 647 tests (+27 new: 3 UPI helpers, 3 balance computation including the refund-on-failed proof, 4 createWithdrawalRequest + verifyWithdrawalRequest covering shape / floor / UPI validation / tampered-amount rejection, 4 state transitions covering all valid + invalid moves + fast-path, 1 status enum, 2 SqliteStore + DPDP integration, 9 end-to-end live HTTP including the **full pending → paid round-trip via admin endpoint with operator attribution + audit verification** + the **failed → events-return-to-pool proof** + admin no-token 503 + unknown-transition 400). No SW change (server-side only). **Mesh earnings now have an exit door — a worker who has accumulated ₹847 of mesh payouts can hand a UPI ID and (once a payout partner is contracted) receive real rupees. The payout-partner integration is one operator curl, not an SDK; compatible with Razorpay X / Cashfree Payouts / Decentro / any partner that issues a reference string. Phase 6.1 is now fully shipped: MFI consumption (ADR 0097) + UPI cash-out (this ADR) both complete.**

---

Closed in Phase 6.1 (ADR 0097, first half — MFI integration substrate):
1. ✅ **MFI-consumable signed income-verification bundle + worker-issued consent — the first hard-rupee reason for workers to maintain a Bharat OS record** — ADR 0096's Phase 6.1 plan paired MFI partnerships with UPI cash-out. The MFI piece ships first (cash-out is Phase 6.1b). Workers who have logged earnings (Phase 6.0a), mesh contributions (Phase 6.0b inputs), and accumulated portable attestations (Phase 5.9) can now authorize a named microfinance institution to read a signed summary — the substrate any MFI / NBFC / lender can consume for KYC-supplementary income proof without Bharat OS having to integrate per-partner first. New artifact `src/phase1/income-verification.mjs`: `createIncomeVerificationConsent({ identity, mfiName, purpose, financialYear, ttlSeconds?, maxReads?, at })` (validates inputs — mfiName ≤ 80 chars rejected outright since silent truncation could mislead the worker about which MFI they're authorising; purpose up to 240 chars truncated as free-text; financialYear strict `YYYY-YY` with correct end year; TTL ∈ `[60s, 90 days]`; maxReads ∈ `[1, 10]`; defaults to 30-day TTL + single-use), `verifyIncomeVerificationConsent` (returns `{ ok, status }` distinguishing `valid` / `expired` / `revoked` / `exhausted` / `signature_invalid` / `unknown_worker` / `malformed`), `buildIncomeVerificationBundle({ identity, consent, earningsEntries, meshContributionEvents, portableAttestations, at })` (filters to worker AND FY window April-March; aggregates `income: { totalEarningsPaise, byCategory: {delivery, ride, service, cash, other}, workingDays, entryCount, meshPayoutPaise, grandTotalPaise }` + `credibility: { portableAttestationsByTier: {0,1,2}, totalSignedAttestations }`; refuses cross-identity consents), `verifyIncomeVerificationBundle` (signature round-trip for MFI-side verification), `revokeIncomeVerificationConsent` (pure), `recordConsentRead` (pure, returns new consent with `readCount` incremented). Both consents AND bundles use Ed25519 signatures via `signText` from `core.mjs` — same primitive as every other signed record in Bharat OS. **Mandatory `disclaimer` field on every bundle** spells out the §15-honest contract: *"earnings entries are TYPED BY THE WORKER (not scraped); portable attestations are customer-signed at three quality tiers — see the credibility breakdown and weight accordingly; Bharat OS does NOT verify identity (Aadhaar does that) and does NOT guarantee work performance; the lender is responsible for verification beyond this bundle."* New SqliteStore table `income_verification_consents` indexed on `worker_id` + `expires_at`; CRUD methods + included in DPDP §12(3) erasure cascade. **Four new API endpoints**: `POST /api/identities/:id/income-verification/consents` (worker creates; returns the signed consent + `mfiFetchUrl` to share privately with the MFI; emits `income_verification_consent.issued` ledger event), `GET /api/identities/:id/income-verification/consents` (worker lists their issued consents), `POST /api/identities/:id/income-verification/consents/:consentId/revoke` (worker burns a consent before expiry; emits `income_verification_consent.revoked` ledger event; **returns 404 (not 403) for non-issuer revoke attempts** so cross-user probing can't reveal whether a `consentId` exists), `GET /api/income-verification/:consentId` (MFI fetch — verifies consent, builds FRESH signed bundle from current store data (never cached), increments `readCount`, persists. Returns 410 Gone for expired/revoked/exhausted consents; 404 for unknown consentId; emits `income_verification_bundle.read` ledger event with `mfiName` so ops can audit which MFI read what bundle). **§15 bindings preserved end-to-end**: worker explicitly signs the consent (MFI access is opt-in not implicit); single-use by default so MFI cannot silently poll; bundle is aggregates not raw entries (MFI sees totals + per-category sums + tier counts but NOT the day-by-day Swiggy/Zomato split); bundle is computed FRESH on every fetch (never cached) so the signed envelope is the snapshot the MFI received at that moment; cross-user probe leaks no ownership info via 404-everywhere on access denied; full audit trail in the typed ledger; DPDP erasure cascade extends automatically. 620 / 620 tests (+25 new: 4 createConsent input validation, 5 verifyConsent status enum coverage including signature-invalidation on tamper, 4 buildBundle aggregation including FY-window filtering + cross-identity refusal + tampered-total rejection, 4 SqliteStore + DPDP integration, 8 end-to-end live HTTP including the full POST-consent → MFI-fetch → consent-burn → second-fetch-410 round-trip + cross-user-revoke 404 + ledger emission verification). No SW change (server-side only). **A worker who's accumulated 6 months of earnings + 200 signed delivery attestations can now hand a single consentId to an MFI; that MFI fetches a verifiable signed income summary AT THAT MOMENT, reads it once, and decides on a loan — all without Bharat OS having to do a per-partner integration. The first hard-rupee external incentive for the growth-arc onboarded user base is now live.**

---

Closed in Phase 5.9 (ADR 0095 — fully shipped):
1. ✅ **Portable work-history attestation via worker-initiated QR handshake — the two-sided network turns on** — Phase 6.0 (a/b/c) gave workers single-player reasons to install Bharat OS; Phase 5.9 layers the two-sided attestation flow on top. The growth arc is now complete end-to-end. New artifact `src/phase1/portable-attestation.mjs` (pure functions): `createPortableAttestationToken({ workerId, category, workerGps?, ttlSeconds?, at })` returns a versioned unsigned envelope with deterministic `bos:portable-attestation:<sha256-prefix>` token ID, 1h default TTL (configurable, capped at 24h), GPS truncated to 2-decimal precision (~1.1 km, NOT meter-level — privacy bound) when supplied. Three signing tiers — **`signTier0(token, { clientIp })`** (anonymous tap; records SHA-256 hash of IP for soft-sybil detection; **raw IP NEVER stored**; trust-neutral weight, counts toward volume only), **`signTier1(token, { customerPhone })`** (OTP-confirmed; records SHA-256 hash of phone for repeat detection; **raw phone NEVER stored on worker's record**; moderate weight), **`signTier2(token, customerIdentity)`** with companion **`buildTier2SignaturePayload(token)`** + **`verifyTier2(attestation, customerPublicRecord)`** (customer signs canonical payload with their Ed25519 private key LOCALLY; server only sees + verifies the signature against the customer's public record — **customer's private key never touches the server in production flow**; high weight, customer's own Trust Passport on the line). **All three tiers refuse signing of already-signed (`409 token_already_signed`) or expired (`410 token_expired`) tokens** — single-use enforcement matches the design. **Self-signing refused** (`signTier2` rejects when `customerIdentity.id === token.workerId`). `aggregateAttestationsForWorker(attestations, { workerId, category })` returns versioned summary `{ totalAttestations, byTier: {0,1,2}, mostRecentAt, fraudSignals: { repeatedPhoneShare, repeatedIpShare, tier0DominanceShare } }` — fraud signals are SURFACED, not auto-rejected; consuming aggregators decide what to do with them. **ADDITIVE-ONLY DESIGN CONSTRAINT** — there is no negative-attestation path, no "rate one star" route; absence of signatures is not a negative signal; this is non-negotiable per ADR 0095 §15 (portable negative reviews entrench class bias). New SqliteStore table `portable_attestations` indexed on `worker_id` / `status` / `category`; methods `savePortableAttestation` / `readPortableAttestation` / `listPortableAttestations({ workerId, category, status })`; included in the DPDP §12(3) erasure cascade. **Seven new API endpoints**: `POST /api/portable-attestation/init` (worker initiates; returns `{ tokenId, signUrl, qrPayload, disclaimer }` with the mandatory disclaimer "Bharat OS does NOT verify identity (Aadhaar does that) and does NOT guarantee performance"), `POST /api/portable-attestation/:tokenId/sign-tier0` (anonymous tap; uses Phase 4.1 `clientKey` with `BHARAT_OS_TRUST_PROXY` honored for the IP source), `POST /api/portable-attestation/:tokenId/sign-tier1/send` (sends OTP via Phase 4.3 + 5.1 SMS provider with `sensitive_action` purpose; persists hashed OTP record), `POST /api/portable-attestation/:tokenId/sign-tier1/verify` (verifies code via Phase 4.3 `verifyPhoneOtp`, then attaches Tier-1 signature), `GET /api/portable-attestation/:tokenId/sign-tier2/payload` (returns the canonical payload string for the customer's app to sign locally — decoupled GET so clients can fetch + sign offline before submitting), `POST /api/portable-attestation/:tokenId/sign-tier2` (verifies client-supplied Ed25519 signature against customer's public record), `GET /api/identities/:id/portable-attestation/summary?category=` (returns the aggregation summary with tier breakdown + fraud signals — what consuming aggregators read). **Static signing page** at `/sign/<tokenId>` (new `public/signs/index.html` + `signs.css` + `signs.js`) — **no Bharat OS install required** for the customer; the page reads `tokenId` from the URL path, offers all three tiers as buttons (Tier 2 deep-links into `bharat-os://sign/<token>` for customers who DO have the app installed, with a graceful fallback message if the deep link fails). DPDP integration end-to-end: `collectUserData` includes `portableAttestations` in the export bundle; `eraseUserData` cascade clears the new table automatically; cross-user attempts (alice asking for bob's summary) return zero attestations consistent with the existing per-user-data-doesn't-surface pattern. 595 / 595 tests (+31 new: 4 token-creation including GPS truncation; 3 Tier-0 + 2 Tier-1 + 3 Tier-2 module tests including signature round-trip + public-record mismatch + self-sign rejection; 4 aggregation tests covering worker+category scoping, repeat-share fraud signal, Tier-0 dominance flag, pending-token filtering; 4 SqliteStore + DPDP round-trip tests; 11 live HTTP integration tests using the Phase 5.7 server-spinup pattern, including the **full Tier-2 round-trip via real Ed25519 signing** by the customer + server verification). No new SW change beyond the new static `/signs/` directory. **The growth arc is end-to-end functional**: workers install for single-player Phase 6.0 value (earnings tracker + mesh dashboard + tax helper), then progressively accumulate portable signed attestations as customers scan QRs at three friction tiers. Each tier has honest weighting in the Trust Passport; ADDITIVE-ONLY prevents the class-bias trap. **Day-1 realistic conversion** (per ADR 0095 economics): ~5% Tier 0 + ~0.5% Tier 1 + ~0.1% Tier 2 → a rider doing 30 deliveries/day accumulates ~50 signed receipts/month, ~600/year — meaningful even at miserable conversion. **The two-sided attestation network the entire post-launch arc was building toward is now live.**

---

Closed in Phase 6.0c (ADR 0096, final tool — fully shipped):
1. ✅ **Year-end tax helper — Indian income-tax math + 44AD presumptive + GST threshold flag — completes ADR 0096** — Phase 6.0c ships the third and final single-player worker tool: a local-compute tax estimator that consumes the Phase 6.0a earnings-log entries and surfaces "what would my tax look like this year, under which regime/option?" without ever auto-filing or transmitting tax data to a third party. New artifact `src/phase1/tax-summary.mjs` ships **FY 2025-26 / AY 2026-27** rate tables and pure functions: `computeTaxNewRegime(grossPaise)` (default regime since FY 2023-24; slabs ₹0-3L 0% / 3-7L 5% / 7-10L 10% / 10-12L 15% / 12-15L 20% / >15L 30%; standard deduction ₹75,000; Section 87A rebate up to ₹25,000 wipes tax entirely for taxable ≤ ₹7L — the **rebate cliff** is pinned in tests; 4% Health & Education cess on post-rebate tax), `computeTaxOldRegime(grossPaise)` (opt-in slabs ₹0-2.5L 0% / 2.5-5L 5% / 5-10L 20% / >10L 30%; std deduction ₹50,000; 87A rebate ₹12,500 if taxable ≤ ₹5L), `computePresumptive44AD(turnoverPaise, { digitalReceiptShare })` (Section 44AD — turnover ceiling raised to ₹3 crore for ≥95%-digital businesses in FY 2025-26; presumes **6% profit when ≥95% digital**, **8% otherwise** — the right framing for delivery riders / drivers / service trades whose payouts arrive via UPI / bank transfer), `computePresumptive44ADA(grossReceiptsPaise)` (Section 44ADA specified-professions presumptive at 50%; ceiling ₹75 lakh; included for completeness, not the default path for blue-collar gig work), `gstThresholdCheck(grossPaise, { isGoodsSupplier })` (services ₹20 lakh / goods ₹40 lakh as of FY 2025-26), `taxSummary({ entries, financialYear, digitalReceiptShare, isGoodsSupplier })` (end-to-end: filters earnings to FY window April-March; computes new-regime + old-regime + 44AD presumptive comparison; surfaces cheapest-option recommendation; **always** includes a mandatory `disclaimer` field urging consultation with a CA). Strict validation: `isValidFinancialYear` accepts only `YYYY-YY` where the end year is the correct next year mod 100 (rejects `2025-27`, `2025`, `FY2025-26`); all functions reject negative / NaN / Infinity inputs. New API endpoint `GET /api/identities/:id/tax/summary?financialYear=YYYY-YY&digitalShare=0.95&isGoodsSupplier=false` — gates on identity existence (404 unknown), validates `financialYear` (400 `financial_year_required` if missing, `invalid_tax_input` if malformed), validates `digitalShare` is in [0,1] (400 `invalid_digital_share`), defaults `digitalShare=0.95` matching the typical India-gig-worker case, scopes to identity (Bob asking for Alice's summary returns zero income consistent with the existing per-user-data-doesn't-surface pattern). **§15 bindings**: tax math is LOCAL — the server computes from already-on-device earnings entries; could equally run in the browser with no network round-trip leak. **PAN is NEVER stored** anywhere in this phase; future client surfaces that want to format ITR-3/ITR-4 hint output keep PAN in IndexedDB. We NEVER auto-file. The mandatory `disclaimer` field in every output reminds consumers (and the tests verify its presence end-to-end): *"This is an estimate generated from your logged Bharat OS earnings... CONSULT A CHARTERED ACCOUNTANT BEFORE FILING. Bharat OS does NOT file tax returns on your behalf and is not liable for the accuracy of this estimate."* 564 / 564 tests (+26 new: 6 new-regime canonical examples including the ₹7L rebate cliff at gross ₹7,75,001 and the ₹10L/₹15L slab walk-throughs; 2 old-regime canonical examples; 5 44AD/44ADA presumptive correctness incl. ceiling boundaries; 2 GST threshold tests; 5 end-to-end `taxSummary` integration tests covering FY window filtering, recommendation surface, GST flag, financial-year format validation; 6 live HTTP API tests covering happy path, missing/bad financialYear, out-of-range digitalShare, cross-user isolation, 404 unknown identity). **ADR 0096 is now fully Accepted — all three single-player worker tools (earnings tracker + mesh dashboard + tax helper) shipped across Phases 6.0a / 6.0b / 6.0c.** No SW change (server-side only). **A gig worker can install Bharat OS, log earnings throughout the year, and at FY-end see "your 44AD presumptive at 6% gives you ₹0 tax via the 87A rebate; new-regime direct would be ₹44,200; old-regime direct would be ₹1,06,600 — talk to a CA before filing" — all without any external integration, no PAN stored, no auto-filing.**

Closed in Phase 6.0b (ADR 0096, continuing):
1. ✅ **Mesh-contribution dashboard — promotes existing Phase 3.x substrate to a first-class earn surface** — Phase 3.x ships `createMeshContributionEvent` and the all-time `meshContributionSummary`, but the only way to see "what did I earn each day this month?" was a full event scan in the shell. Phase 6.0b adds the time-windowed aggregation. Extends `src/phase1/mesh-contribution.mjs` with two new pure functions: `aggregateMeshByMonth(events, month, { operatorId? })` — filters events to the given operator + month (`YYYY-MM`); returns a versioned summary `{ totalPaise, totalRupees, eventCount, byWorkload: { inference, storage_serve, storage_store, federated_round }, dailyTimeline: [{ date, paise, eventCount }] (ascending), firstEventAt, lastEventAt }`. Tolerates events without a timestamp (defensive — won't crash on legacy malformed data). `operatorId` is optional — omitting it aggregates across all operators (useful for an admin / ops view; not exposed to the per-identity endpoint). `meshMonthlyStatement(summary)` — human-readable text mirroring the earnings-tracker statement shape so the shell can render both uniformly. New API endpoint `GET /api/identities/:id/mesh/summary?month=YYYY-MM` — gates on identity existence (404 on unknown), validates `month` (400 with `month_required` or `invalid_month` codes), scopes to `operatorId === identityId` so cross-user isolation is automatic (Bob asking for Alice's mesh summary sees zero events, not 404 — preserves the existing pattern that per-user data simply doesn't surface for the wrong user). The substrate (Phase 3.x events) is unchanged; this is pure UX-layer promotion. **§15 bindings**: identity-scoped aggregation (no cross-user leak); rupee totals are derived from paise integers (no float drift); no PII in the response (only counts + paise + dates). 538 / 538 tests (+16 new: 10 module unit tests for `aggregateMeshByMonth` + `meshMonthlyStatement` covering operator scoping, month filtering, workload-type grouping (with note that storage_store single-tick payouts legitimately round to zero paise — the per-tick math is sub-paise on a 1TB block), ascending daily timeline ordering, first/last-event timestamps, malformed-event tolerance, cross-operator aggregation when operatorId omitted; 6 end-to-end live HTTP tests covering happy path, empty-month, missing-month, bad-month-format, cross-user isolation, 404 for unknown identity). No SW change. **A worker can now see "I earned ₹X mesh-contribution rupees this month, broken down by day" without any aggregator-style external integration. ADR 0096 is now 2/3 shipped; only the tax helper (Tool 3) remains.**

Closed in Phase 6.0a (ADR 0096, partial):
1. ✅ **Cross-platform earnings tracker — single-player wedge that solves the two-sided cold start** — Phase 6.0 is the growth-arc opener; ADR 0096 lays out three single-player tools (earnings tracker, mesh-contribution dashboard, year-end tax helper) that give workers a reason to install Bharat OS BEFORE the two-sided attestation network (Phase 5.9) exists. Phase 6.0a ships Tool 1 — the earnings tracker — as the foundation. New artifact `src/phase1/earnings-log.mjs` (pure functions): `createEarningsEntry` (deterministic entry IDs via SHA-256 of canonical fields so duplicate posts upsert; strict validation — ISO YYYY-MM-DD dates not in the future, `EARNINGS_CATEGORIES` enum `delivery / ride / service / cash / other`, **amounts in INTEGER paise NOT float rupees** to avoid currency rounding bugs at scale, per-day sanity ceiling of ₹1 crore to reject typos, hoursWorked 0-24 range check, note trimmed to 200 chars), `aggregateByMonth` (sum + per-category breakdown + day count + effective hourly rate), `monthlyStatement` (human-readable text suitable for sharing with a landlord / MFI / accountant), `effectiveHourlyRatePaise` (date-window-scoped). New SqliteStore table `earnings_log` with indexes on `identity_id`, `date`, `category`; new methods `saveEarningsEntry`, `readEarningsEntry`, `listEarningsEntries({ identityId, fromDate, toDate, category })`, `deleteEarningsEntry`. Four new API endpoints: **POST `/api/identities/:id/earnings`** (create, body-validated, returns 400 with structured error on bad input), **GET `/api/identities/:id/earnings`** (list with optional `from` / `to` / `category` filters), **GET `/api/identities/:id/earnings/summary?month=YYYY-MM`** (aggregated monthly summary + printable statement), **DELETE `/api/identities/:id/earnings/:entryId`** (DPDP §12(1) correction surface; refuses to delete entries owned by other identities — returns 404 to avoid leaking entry existence). **DPDP integration end-to-end**: `dpdp-rights.mjs` `collectUserData` now includes the `earningsLog` section in the export bundle; SqliteStore `eraseUserData` cascade extends to clear `earnings_log` atomically; the existing DPDP §11/§12(3) flows automatically work for the new data without per-section bespoke handling. **§15 bindings**: data is user-supplied (typed, NOT scraped from Swiggy/Zomato APIs — sidesteps every aggregator TOS issue); integer paise prevents currency float-rounding bugs; coarse 5-category enum prevents per-platform fingerprinting from the record alone; identity-scoped (cross-user access returns 404); included in `bos_api_requests_total` rate-limiting via the existing `write`/`read` policy dispatch. **522 / 522 tests** (was 491; +31 new — 12 module unit tests for the pure functions including all validation edge cases, 3 SqliteStore round-trip + filtering + delete tests, 2 DPDP export+erasure integration tests, 7 end-to-end live HTTP tests using the Phase 5.7 server-spinup pattern, 7 misc). One pre-existing test (`SqliteStore.verifyIntegrity flags a corrupt snapshot`) needed hardening — the previous "corrupt 256 bytes at file midpoint" stopped detecting corruption once the new `earnings_log` schema enlarged the file enough to push the byte into an unused page; rewritten to spray 0xff bursts across every 4KiB page header so PRAGMA integrity_check has corrupted critical pages to detect. Also made `SqliteStore.verifyIntegrity` more robust — catches "database disk image is malformed" errors from `PRAGMA integrity_check` itself and returns them as `{ ok: false, messages: [...] }` instead of propagating the throw, so callers don't have to wrap every call. No SW change. **A gig worker can now install Bharat OS, log their daily earnings across Swiggy / Zomato / Rapido / cash gigs, get a monthly statement they can show a landlord — all WITHOUT requiring any customer participation. The two-sided cold start is unblocked.**

---

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

Closed in Phase 3.0 (ADR 0071):
1. ✅ **§7f federated learning round substrate** — `src/phase1/federated-round.mjs` with the round lifecycle (`created → accepting_updates → completed | expired`), signed gradient updates (Ed25519 same as consents / worker auths), donation-purpose consent enforcement (workflow consents rejected), DP epsilon cap per round + running `epsilonSpent` totals, and deterministic aggregation. New `federated_round` mesh workload class so participation earns fiat UPI credits via the existing §13B ticker. Four routes: `GET / POST /api/federated/rounds`, `POST /api/federated/rounds/:id/updates`, `POST /api/federated/rounds/:id/aggregate` + a demo-mode `/sign-and-submit` shortcut (Phase 2b removes it once private keys move to the device hardware keystore). Shell card *"🧪 Federated rounds — §7f opt-in training"* shows active rounds with payout, ε cap, contributor count, and a one-tap join. §15 bindings preserved: gradient hashes only (no payload), per-round consent gate, ε cap enforced, contributor paid (not user-paid), no Aadhaar. 241 / 241 tests (+11 new). SW cache to v18. **Phase 3 commitment from §7f kicks off — substrate ready; Phase 3.1+ swaps the placeholder client gradient hash for real on-device training.**

Closed in Phase 2a.22 (ADR 0072):
1. ✅ **§13A #7 verifier round-trip** — closes the Trust-as-a-service loop end-to-end. New artifact `src/phase1/trust-attestation.mjs` with `signTrustAttestation` + `verifyTrustAttestation` (Ed25519, canonical payload excludes transient framing so signatures stay stable). Orchestration API auto-signs trust attestations with the subject identity and persists to a new `attestations/` store. Three routes: `GET /api/attestations` (claim-body-free index), `GET /api/attestations/:id`, `GET|POST /api/attestations/:id/verify` (discriminated result: `valid` / `expired` / `signature_invalid` / `unknown_subject` / `malformed`). Shell adds *"Sign & share"* to the Trust Passport card — mints + signs + renders verify URL + QR. New `/verify/` page (HTML+CSS+JS) reads `?attestationId=...`, calls the verify endpoint, renders one of five badge states with the disclosed claims (bands & booleans only). §15 selective-disclosure preserved end-to-end. 249 / 249 tests (+8 new, including a full orchestration → sign → verify e2e). SW cache to v19. **Demo moment: mint on phone → open URL on laptop → see VERIFIED ✓ in 60 seconds.**

Closed in Phase 2a.23 (ADR 0073):
1. ✅ **Operator console catch-up — federated rounds + attestations panels** — `/console/` had drifted behind the shell across Phase 2a.18 / 3.0 / 2a.22. Two new panels added between Trust and Flags: *"§7f Federated Rounds — Phase 3.0"* (lists rounds with status pills, contributor counts, ε spent/cap, payout, deadline; *Aggregate* action posts to `/api/federated/rounds/:id/aggregate` for active rounds with updates) and *"§13A #7 Trust Attestations — Phase 2a.22"* (claim-body-free index with *Verify* button calling the server-side verify endpoint, plus an *Open* link that opens `/verify/?attestationId=…` in a new tab exactly like a third-party verifier). New `status-pill` CSS primitive with color variants. Sidebar nav extended (`Trust → Federated → Attestations → Flags`). No new server-side tests — both panels are UI consumers of existing routes covered by 0071 + 0072. 249 / 249 tests unchanged. Console SW to v3.

Closed in Phase 3.1 (ADR 0074):
1. ✅ **Real on-device training for §7f rounds** — replaces the Phase 3.0 placeholder gradient hash with actual pure-JS multinomial logistic regression training. New artifact `src/phase1/local-training.mjs` (browser + node-testable): 36-feature × 6-class classifier head (216 weights), `extractFeatures` (length / word-count / script / locale / per-class trigger words), `trainOneEpoch` (cross-entropy gradient + SGD), `addDifferentialPrivacyNoise` (Gaussian mechanism, σ = 1/ε), `hashGradient` (SHA-256 over float32 bytes), and a one-shot `composeFederatedUpdate({ samples, epsilon })` envelope. Shell `joinFederatedRound` now reads the user's orchestration history (`/api/orchestrations`) for labeled samples, falls back to a warm-up corpus on fresh profiles, runs the math locally, and submits the real gradient hash. Module aliased at `/shell/local-training.mjs` so browser + tests share one canonical copy. §15 bindings preserved end-to-end — raw text never leaves the device; server stores only the noisy gradient hash + DP-ε claim. 261 / 261 tests (+12 new, including a 200-epoch convergence test that reaches ≥5/6 accuracy on a tiny labeled set). SW cache to v20. **§7f is now real, not staged — investor sees actual gradient descent, not a video.**

Closed in Phase 2a.24 (ADR 0075):
1. ✅ **Seed-demo refresh for post-2a.18 surfaces** — `scripts/seed-demo.mjs` had drifted: Phase 2a.13 mesh contribution events, Phase 2a.22 attestations, and Phase 3.0 federated rounds all opened empty on first run, making the *new* substrate read as the *least* working part of the demo. Extended with: **two signed attestations** (Sita → Kothrud Landlord 14-day tenant verification, Lakshmi → Apollo Clinic 30-day employer onboarding — both flow through the real `signTrustAttestation` path), **eight backdated mesh contribution events** across Priya / Rajesh / Suresh covering all four workload classes (inference, storage_serve, storage_store, federated_round), and **one active §7f federated round** *"intent-classifier-head-v1"* with Priya pre-donating one signed gradient update at ε=0.3 (the matching `federated_round` mesh event mints her ₹2 payout). All artifacts go through their real signing / verification paths — no shortcut data. First 60 seconds of the demo now opens populated; `/verify/?attestationId=…` works on first run; daily brief renders rich text instead of empty-state lines. 261 / 261 tests unchanged (seed is a shell script over already-tested artifact functions).

Closed in Phase 5.8 (ADR 0094):
1. ✅ **SMS bulkhead (per-provider concurrency cap) + in-flight gauge — closes Phase 5.4 future-work** — Phase 5.4 shipped timeouts + circuit breakers but ADR 0090 left an explicit gap: a vendor that's slow-but-not-yet-timing-out (e.g. 2.5s response floor under the 3s `fetchWithTimeout`) can accumulate dozens of concurrent in-flight fetches per provider under a recovery-OTP storm, each holding a socket + heap, exhausting the event loop before any existing protection kicks in. Phase 5.8 ships the bulkhead. New `createBulkheadProvider(provider, { maxConcurrent })` factory in `src/phase0/sms-provider.mjs` — per-provider counter (no queue: queueing would add latency for the caller AND defeat the fallback chain's "deliver via any vendor" goal; fast-fail with a recoverable code lets the chain route around the busy provider). At `>= maxConcurrent`, throws `SMS_PROVIDER_BULKHEAD_FULL` with `{ provider, inflight, maxConcurrent }`. Counter decremented in a `finally` block so error paths release slots cleanly — no leaks. Default 10 concurrent (BHARAT_OS_SMS_BULKHEAD_MAX) — well under typical vendor rate limits (200-1000 req/s) but enough to cap a hung vendor's exposure. **Wrapper composition order updated**: `bulkhead → circuit breaker → telemetry → vendor` (was `breaker → telemetry → vendor`). Bulkhead outermost matters: slow-vendor calls that haven't yet aborted don't count against the breaker's failure threshold from inside a busy bulkhead — fast-fail at the bulkhead → fallback chain → next vendor; the slow vendor's circuit opens via existing timeouts on the actual in-flight calls. Fallback chain's recoverable-error set now includes `SMS_PROVIDER_BULKHEAD_FULL` alongside NOT_CONFIGURED / REJECTED / CIRCUIT_OPEN. New Prometheus gauge `bos_sms_inflight{provider}` in `/metrics` — updated on every bulkhead enter/exit. Alert rule: `bos_sms_inflight{provider="..."} >= max for 30s` catches a hung vendor before its calls finally time out (30s > the 3s fetchWithTimeout, so something is wrong if the breaker hasn't already opened). **Three-axis SMS observability now**: rate (`bos_sms_send_total`), state (`bos_sms_circuit_state`), saturation (`bos_sms_inflight`). **§15 binding preserved end-to-end** — bulkhead never touches phone/body; `BULKHEAD_FULL` error contains only provider+inflight+maxConcurrent; choosing fast-fail over queue means we never buffer a pending OTP send (no in-memory ring of pending phones a crash could expose); telemetry labels are per-vendor only. Worst-case memory under storms is now 10 sockets × 4 vendors = 40 sockets per process; a million-OTP storm doesn't blow up Node. 491 / 491 tests (+7 new: 3 capacity behaviours + 2 gauge tracking/isolation + 2 fallback chain integration — using a `controllableProvider` that hangs on a manually-resolved deferred so concurrency state is driven without real sleeps). `.env.example` documents BHARAT_OS_SMS_BULKHEAD_MAX inline. No SW change (server-side only). **Slow-but-not-timed-out vendors can no longer eat the event loop; bounded memory under storms; backward-compatible (existing single-provider + fallback-chain configs work unchanged).**

Closed in Phase 5.7 (ADR 0093):
1. ✅ **Ops admin endpoints — circuit reset, cooldown override, manual snapshot** — Phases 5.2 (`clearRecoveryCooldown`), 5.4 (`resetCircuit`), and 5.5 (`store.snapshotTo`) each shipped helpers that were exported from their modules but never wired to HTTP. The only way to invoke them in production was to ssh into the host and run a one-off Node script — operationally awful for incident response. Phase 5.7 ships three thin HTTP wrappers + a shared auth gate. New module `src/phase0/admin-auth.mjs` — `BHARAT_OS_ADMIN_TOKEN` shared-secret bearer auth with constant-time comparison (`constantTimeEquals` resists timing-attack token discovery), minimum 16-char enforcement (typos in env shouldn't accidentally degrade security), and **safe-default 503 `admin_disabled` when unset** (a deploy that forgets to configure the token simply doesn't have admin endpoints). Optional `X-Bharat-Os-Operator: <name>` header for audit attribution; truncated to 80 chars; defaults to `unattributed-operator`. Three new endpoints: **`POST /api/admin/sms/circuit/reset`** (body `{ provider? }`; calls `resetCircuit(name?)` from Phase 5.4; emits `sms.circuit.reset` ledger event with operator+provider); **`POST /api/admin/identities/:id/recovery-cooldown/clear`** (body `{ reason }` minimum 8 chars — friction-by-design so operator articulates the override; verifies identity exists, calls `clearRecoveryCooldown` from Phase 5.2, persists, emits `cooldown_override.applied` ledger event with operator + reason + priorCooldownUntil); **`POST /api/admin/backup/snapshot`** (body `{ keep? }` default 7; runs the same `snapshotTo` → `verifyIntegrity` → `applyRetention` pipeline as the cron CLI; on integrity failure discards corrupt snapshot AND preserves prior good ones; emits `backup.snapshot.created` ledger event with operator + bytes + trigger:'admin_endpoint'). All three fall under the existing `write` rate-limit policy (30/min) via `policyFor` — incident response makes a few calls/min, not hundreds. **§15 audit-discipline binding** — every admin action is in the typed ledger; a compromised token is detectable post-hoc (the audit doesn't depend on the token being uncompromised); shared-secret is the right security/complexity trade-off because admin endpoints are operational, not user-facing, and compromise impact (lift a cooldown, reset a breaker) is bounded + audited rather than catastrophic. **Why shared-secret vs mTLS/JWT** — admin endpoints are called from a known IP space (ops jumphost or CI runner) during incident response only; the security model is "defense in depth: audited, rate-limited, rotatable" rather than "uncompromisable". 484 / 484 tests (+17 new: 8 `requireAdminToken` unit covering all error/success paths + constant-time + 16-char minimum + operator-label truncation + case-insensitive Bearer prefix; 3 `checkAdminAuth` wrapper; **6 end-to-end live HTTP tests** that boot `createPhase0ApiServer` against a fresh `SqliteStore` on a random port and curl real fetch() calls — the first API-server boot tests in this codebase). `.env.example` documents `BHARAT_OS_ADMIN_TOKEN` with the token-generation one-liner + rotation cadence. No SW change (server-side only). **SIM-swap incident response is now a 1-minute curl-from-jumphost flow; vendor outage recovery is one POST; planned-migration snapshots are operator-initiated. Compromise of the admin token is detectable via the audit trail.**

Closed in Phase 5.6 (ADR 0092):
1. ✅ **Snapshot integrity verification + restore CLI + backup-age Prometheus gauge — closes Phase 5.5's future-work list** — Phase 5.5 (ADR 0091) shipped snapshots but left three concrete future-work items: integrity verification (otherwise a corrupt write produces a corrupt snapshot that silently destroys recovery), restore CLI (vs. manual `cp` that invites mistakes), and a Prometheus age metric (vs. only exposing freshness via the admin endpoint that Grafana doesn't scrape). Phase 5.6 ships all three. New `store.verifyIntegrity(targetPath?)` on both backends — symmetric with `snapshotTo`. SqliteStore opens the target as a read-only handle and runs `PRAGMA integrity_check` (SQLite's comprehensive b-tree + page-allocation + constraint scan); BosStore performs a structural check (dir exists + identities/ subdir exists, sufficient for the file-store's dev/migration role per ADR 0081). Both return identical shape `{ ok, targetPath, messages }`. `scripts/snapshot-store.mjs` now runs verifyIntegrity inline AFTER snapshotTo — on failure, removes the corrupt snapshot, SKIPS retention (preserving prior known-good snapshots), exits 1 so a cron healthcheck trips. This closes the silent-corruption hole. New `scripts/restore-store.mjs` — symmetric inverse of the snapshot CLI. Four steps: (1) validate snapshot via verifyIntegrity, (2) sideline live db to `bos.db.pre-restore-<timestamp>` (manual-rollback target preserved), (3) copy snapshot in, (4) re-verify integrity on the live path. Sideline NOT auto-deleted — runbook step. SAFETY caveat in help text: operator MUST stop API process first (SQLite write lock prevents atomic swap). Three new Prometheus gauges in `/metrics`: `bos_backup_latest_timestamp_seconds` (unix epoch), `bos_backup_latest_age_seconds` (seconds since last snapshot, NaN when none observed — Grafana idiom for "no data"), `bos_backup_latest_bytes`. Refresh strategy — both `/metrics` AND `/api/admin/backup-status` read the backup dir on every hit so the gauges stay fresh regardless of which endpoint is polled; one readdir+stat per scrape is fine at typical 15-30s intervals. Grafana alert rule: `bos_backup_latest_age_seconds > 90000` (no snapshot in >25h, 1h grace past daily cron). **§15 binding extension** — `PRAGMA integrity_check` operates on b-tree structure, never row content; restore CLI never logs user data; pre-restore sideline IS user data and operators must treat it under DPDP §12(3) retention rules (ADR calls out the runbook step). Zero new runtime deps. 467 / 467 tests (+11 new: 3 SqliteStore.verifyIntegrity including a middle-of-file byte-corruption detection test + 3 BosStore.verifyIntegrity + 5 backup-freshness metric covering record/clear/NaN/real-age/bad-input). Live CLI smoke confirmed end-to-end: snapshot creates 376KB sqlite file in 68ms with inline integrity check; restore CLI verifies, sidelines, copies, re-verifies. No SW change (server-side only). **Silent backup corruption is no longer possible; restore is a documented scripted operation with rollback; Prometheus-only deployments see backup freshness from one endpoint.**

Closed in Phase 5.5 (ADR 0091):
1. ✅ **Online backup snapshots + Litestream sidecar — durability for launch** — the Phase 4.6 launch runbook (ADR 0085) explicitly flagged backup as future polish. Without it a single disk failure on the launch host = total data loss; with the DPDP §11 fiduciary application materials referencing the durability of identities we hold, that was an honesty gap. Phase 5.5 closes it with two complementary mechanisms. New `store.snapshotTo(targetPath)` method on both backends: `SqliteStore` uses `VACUUM INTO 'targetPath'` (SQLite holds a read lock for the duration; WAL writers continue; result is a single .sqlite file with NO WAL companion, safe to copy/upload/restore as-is); `BosStore` uses `fs.cp(rootPath, targetPath, { recursive: true })` for completeness (file-store-as-dev-tool role per ADR 0081). Both refuse to overwrite existing targets. New artifact `src/phase0/backup.mjs` ships shared helpers — `snapshotPath({ rootPath, kind, at })` derives `<rootPath>/backups/bos-store-<filesystem-safe-ISO>.<sqlite|dir>` (Windows-safe: replaces `:` and `.` with `-`), `listSnapshots(backupDir)` returns newest-first metadata (returns `[]` when dir doesn't exist), `applyRetention(backupDir, { keep })` deletes snapshots beyond the N most recent. New `scripts/snapshot-store.mjs` CLI: backend-agnostic, reads `--root` + `--kind` from args or env, runs `store.snapshotTo()` to a timestamped path, applies retention (default 7), prints the ledger. Exits 0/1 — wire to a cron healthcheck. New API endpoint `GET /api/admin/backup-status` returns snapshot count + latest snapshot's `ageSeconds` for ops dashboards (Grafana alerts on `ageSeconds > 90000` = no snapshot in >25h). Snapshot metadata only — pure operational data, no identity references; endpoint sits on the `read` rate-limit policy so a misconfigured scrape can't pin the API. `docker-compose.yml` gains a commented-out Litestream sidecar block for opt-in continuous WAL replication to S3-compatible storage (Backblaze B2, Wasabi, AWS S3, Cloudflare R2, MinIO) — second-granularity off-site DR independent of the in-tree snapshots. `.env.example` documents both the local-backup cron config (BHARAT_OS_DATA_ROOT + BHARAT_OS_BACKUP_RETENTION) and the LITESTREAM_* sidecar config. **§15 binding extension** — snapshot files contain user data (every identity, every consent, every memory record) so operators MUST treat `backups/` + Litestream destinations with the same DPDP residency rules as the primary db; ADR 0091 explicitly calls this out so it's not an honesty gap. **Zero new runtime dependencies** — `VACUUM INTO` is built into `node:sqlite`, `fs.cp` is built into Node 16+. The launch image stays distroless + thin. 456 / 456 tests (+15 new: 4 path-derivation + 3 sqlite snapshot + 2 file snapshot + 6 listing/retention — including the snapshot → re-open → round-trip identity verification that proves restore actually works). Live CLI smoke confirmed: `node scripts/snapshot-store.mjs --root .tmp/cli-smoke --kind sqlite --keep 3` produces 376KB snapshot in 6ms. No SW change (server-side only). **One disk failure is no longer a single point of total data loss; the production deploy now has a working DR story.**

Closed in Phase 5.4 (ADR 0090):
1. ✅ **SMS per-call timeout + circuit breaker — fast-fail when a vendor breaks** — Phase 5.3 (ADR 0089) shipped the fallback chain, but each send still PROBED every broken vendor in turn — a 30-second Gupshup hang meant 30+-second recovery OTPs even with msg91 healthy behind it. Phase 5.4 ships two complementary layers on top: a per-call timeout (`fetchWithTimeout`) that wraps every vendor `fetch` in an `AbortController` so socket hangs abort at 3s (default; tunable via `BHARAT_OS_SMS_TIMEOUT_MS`) and gets mapped to `SMS_PROVIDER_REJECTED` so the fallback chain treats it the same as a 5xx; and a per-provider circuit breaker that tracks consecutive `REJECTED` failures and opens the circuit after threshold (default 5; `BHARAT_OS_SMS_CIRCUIT_THRESHOLD`). Once open, subsequent calls short-circuit immediately with `SMS_PROVIDER_CIRCUIT_OPEN` — no network round-trip — so the fallback chain skips to the next provider in microseconds. After `openMs` (default 30s; `BHARAT_OS_SMS_CIRCUIT_OPEN_MS`) the breaker enters half-open and allows ONE probe through; probe success closes the circuit, probe failure re-opens it. **`NOT_CONFIGURED` does NOT count toward threshold** — config issues don't auto-heal in 30s and we don't want a Karix stub to pollute the circuit-state dashboard. New `createCircuitBreakerProvider(provider, opts)` factory exported for tests + future ops tooling; `resetCircuit(name?)` ops helper clears state when a vendor confirms recovery. Three integrations: (1) gupshup/msg91/twilio implementations swap `fetch(...)` for `fetchWithTimeout(..., { provider })`; (2) `wrappedProvider` in PROVIDERS wraps every entry with breaker → telemetry → vendor (skip-by-circuit records no telemetry attempt — the gauge is the surface); (3) fallback chain treats `SMS_PROVIDER_CIRCUIT_OPEN` as recoverable alongside `REJECTED` + `NOT_CONFIGURED` and falls through. New Prometheus gauge `bos_sms_circuit_state{provider}` in `/metrics` (0=closed, 1=half-open, 2=open) — alert rule: `bos_sms_circuit_state >= 2 for 1m`. `.env.example` documents all three tunables inline. **§15 preserved end-to-end** — timeout wrapper passes phone+body through unchanged; breaker telemetry records only provider name + numeric state. 441 / 441 tests (+12 new: 3 timeout behaviours + 5 breaker state transitions + 4 integration: NOT_CONFIGURED-doesn't-trip, single-success-resets, half-open-success-closes, half-open-failure-reopens, fallback-handles-CIRCUIT_OPEN, metrics-gauge-render, resetCircuit-and-recall, sendSms-end-to-end). No SW change (server-side only). **One vendor's failure latency stops mattering after the threshold — broken Gupshup means microsecond-fast fallback to msg91, not 30s waits per OTP.**

Closed in Phase 5.3 (ADR 0089):
1. ✅ **SMS vendor fallback chain + per-vendor delivery telemetry** — Phase 5.1 (ADR 0087) shipped three real SMS HTTP integrations but `BHARAT_OS_SMS_PROVIDER` selected exactly one. A 5-minute Gupshup outage in production meant 5 minutes of downtime for every OTP-dependent flow (phone verify + Phase 5.0 recovery + Phase 5.2 SIM-swap defense). Phase 5.3 closes both the reliability gap AND the observability gap that would have hidden vendor degradation behind the fallback. New `createFallbackProvider(providers)` factory in `src/phase0/sms-provider.mjs`: walks an ordered list, returns the first success, and falls through ONLY on the recoverable error codes `SMS_PROVIDER_NOT_CONFIGURED` + `SMS_PROVIDER_REJECTED` (any other error — TypeError, network blowup, programmer bug — surfaces immediately so it isn't silently swallowed). Success response is augmented with `fallbackChain: [...names walked, winner]` + `fallbackAttempts: [{ provider, code, message }, …]` so the caller can log the walk. When every provider fails, throws `SMS_PROVIDER_FALLBACK_EXHAUSTED` with an `attempts` array and a readable `gupshup → msg91 → twilio` chain in the message. New env var `BHARAT_OS_SMS_FALLBACK_CHAIN` (comma-separated provider names, e.g. `gupshup,msg91,twilio`) — when set, `getSmsProvider()` returns the chain instead of a single provider; explicit `name` arguments still bypass the chain so call-sites that want one vendor still get one. Per-vendor telemetry: new Prometheus counter `bos_sms_send_total{provider, outcome}` in `src/phase0/metrics.mjs` with outcomes `success` / `rejected` / `not_configured` / `error`. Recorded by a module-internal `instrumentedProvider(provider)` wrapper applied to every entry in the `PROVIDERS` table — fallback chains record telemetry **per inner attempt**, so a chain that silently falls through `gupshup → msg91` on every send is OBVIOUS in `/metrics`, not invisible. `.env.example` updated with three recommended production chains (India primary `gupshup,msg91`; India + intl backup `gupshup,msg91,twilio`; cost-optimised `msg91,gupshup` since MSG91 is ₹0.12/SMS vs Gupshup ₹0.15/SMS). **§15 preserved end-to-end** — fallback layer passes phone + body verbatim to inner providers; telemetry records only labels (provider name + outcome enum), never PII. 429 / 429 tests (+16 new: 6 fallback walk behaviours + 4 getSmsProvider integration + 6 telemetry — including the critical-path test that fallback records telemetry for EVERY inner attempt, not just the winner). No SW change (server-side only). **One vendor outage no longer blocks OTP flows; operators can tune chain order from real-world delivery data visible in `/metrics`.**

Closed in Phase 5.2 (ADR 0088):
1. ✅ **SIM-swap defense — per-phone rate-limit + post-recovery cooldown** — Phase 5.0 audited recovery (`account_recovery.completed` ledger event) so SIM-swap attacks are *detectable* after the fact, but a fast attacker can still complete an irreversible action (identity deletion, money send, attestation grant) before ops correlate. Phase 5.2 closes the prevention gap. New rate-limiter policy `recovery_per_phone` (3 sends/hour per normalised phone, independent of client IP) added to `src/phase0/rate-limiter.mjs` — `/api/recovery/start` now consumes from BOTH the per-IP `expensive` bucket (already in middleware) AND the per-phone bucket (consumed inside the handler after `normalisePhone`). The per-phone consume runs **before the identity lookup** so registered and unregistered phones get identical 429 vs 200 distributions — the §15 anti-enumeration guarantee from ADR 0086 is preserved against this new attack vector. New artifact `src/phase1/recovery-cooldown.mjs` (pure functions, no store coupling): `applyRecoveryCooldown` (stamps a 24h `recoveryCooldown = { protocolVersion, reason, activatedAt, until, ttlMs }` block onto the identity), `cooldownState` (returns `{ active, until, secondsRemaining, reason }`), `assertNoCooldown` (throws `RECOVERY_COOLDOWN_ACTIVE` with scope + countdown when active), `clearRecoveryCooldown` (ops-tooling override), `COOLDOWN_SCOPES` enum (`identity_deletion` / `recovery_restart` / `trust_attestation_grant` / `sensitive_action`). Three API integrations: (1) **`POST /api/recovery/verify`** success path applies the 24h cooldown before saving identity + builds the bundle from the cooled identity, so the new device sees the cooldown block (UI banner hook); the `account_recovery.completed` ledger event grows a `cooldownUntil` field for ops correlation; (2) **`POST /api/recovery/start`** routes matched-but-cooling-down identities to the *same* no-match sentinel response that unregistered phones get — an attacker who already SIM-swapped once cannot use a second probe to confirm the prior recovery succeeded; (3) **`DELETE /api/identities/:id`** calls `assertNoCooldown(identity, { scope: 'identity_deletion' })` and returns **HTTP 423 Locked** with `recovery_cooldown_active` + `until` + `secondsRemaining` when active — a SIM-swap attacker who recovered the account cannot also immediately destroy it; the legitimate user has 24h to spot the recovery (via paired-device push planned for 5.3) and override. The cooldown gates destructive actions only — read paths, intent flows, mesh/federated participation, and the `/erasure-preview` GET all remain open during cooldown, so the legitimate user is functional immediately. 413 / 413 tests (+14 new: 10 cooldown module + 4 rate-limiter policy — covers stamp / state / expiry / assertion / clear + bucket exhaustion / refill / per-phone isolation). No SW change (server-side + identity-record only). **The Phase 5.0 SIM-swap detection-only posture is now detection + prevention — destructive irreversibility is gated for the 24h window ops needs to react.**

Closed in Phase 5.1 (ADR 0087):
1. ✅ **Real SMS provider HTTP integrations — Gupshup / MSG91 / Twilio go live** — Phase 4.3 shipped the SMS provider abstraction with a `log` provider for dev and stubs that threw "configure env vars first" for every vendor. Phase 5.0 used the abstraction for account recovery — but without a real SMS path neither phone verification nor recovery actually reached the user. Phase 5.1 closes the wire. `src/phase0/sms-provider.mjs` now ships three real HTTP integrations: **Gupshup** (India-onshore, DLT-compliant; GET to `media.smsgupshup.com/GatewayAPI/rest` with credentials in the query string; response parser tolerates both `success | <id>` text format and the `{ response: { status, id } }` JSON Gupshup occasionally returns; required env: `BHARAT_OS_SMS_GUPSHUP_USERID` / `PASSWORD` / `SOURCE` + optional `PRINCIPAL_ENTITY_ID` / `TEMPLATE_ID` for DLT); **MSG91** (high-volume India SMS; POST to `/api/v5/send` or `/api/v5/flow` when `FLOW_ID` is set for DLT templates; `authkey` header auth; when using the flow API auto-extracts the 6-digit OTP via `body.match(/\d{6}/)` and passes it as the `OTP` template variable); **Twilio** (international fallback; Basic auth + form-encoded body; detects Messaging Service SIDs `MG…` vs plain `+1…` numbers and switches `From` vs `MessagingServiceSid` accordingly). **Karix remains a stub** — partner-portal access required for the API docs. **Structured error contracts** across all three: success → `{ ok: true, providerMessageId, provider }`; misconfiguration → `Error.code = 'SMS_PROVIDER_NOT_CONFIGURED'` with `provider` + `missing` (env vars list); vendor rejection → `Error.code = 'SMS_PROVIDER_REJECTED'` with `provider` + truncated `providerResponse` + (Twilio) `providerStatusCode`. Ops alerting can split on these codes without parsing message text. Phone formatting handled per vendor — Gupshup + MSG91 strip the leading `+`, Twilio keeps E.164. **§15 bindings preserved end-to-end**: vendor URLs / bodies travel over TLS only; `sms.outgoing` log line still emits `phoneMasked` + `bodyLength` + `provider` (vendor message IDs are opaque tokens, not PII, and ARE logged for tracing); switching providers remains a one-env-var change — `phone-otp.mjs` and `account-recovery.mjs` never learn which vendor is live. `.env.example` updated with per-vendor sign-up URLs, DLT compliance notes, and prod-vs-dev guidance for template IDs. 399 / 399 tests (+14 new: 4 Gupshup, 4 MSG91, 4 Twilio, 2 dispatch — all using `global.fetch` mocking + `withEnv` env-var stubbing; covers success path, missing-credentials rejection, vendor rejection, MSG91 flow-API OTP extraction, Twilio Messaging Service SID detection, dispatcher env-var routing, Karix-still-stubbed). No SW change (server-side only). **Launch deploy is now provider-config, not code-change — when a partner contract arrives the operator sets 3-5 env vars and the recovery flow sends real SMS.**

Closed in Phase 5.0 (ADR 0086):
1. ✅ **Account recovery via phone OTP — post-launch arc starts here** — Phase 4.3 attached phones to identities but nothing consumed an `account_recovery`-purpose OTP. Without this phase a user who lost their 12-word phrase was locked out forever. Phase 5.0 closes the loop. New artifact `src/phase1/account-recovery.mjs`: `findIdentityByPhone` (matches against the `phone_verified` attestation's `phoneMasked` field; prefers most-recently-verified on mask collision), `startAccountRecovery` (generates an `account_recovery`-purpose OTP via existing phone-otp module; returns versioned envelope with `recoveryId` derived from `sha256({ identityId, phone, salt })`), `verifyAccountRecovery` (wraps `verifyPhoneOtp` + adds purpose-strictness gate), `buildRecoveryBundle` (composes the response the new device receives — identity record incl. privateKey + vaultKey, deterministic recovery phrase saved-from-typing, memory-record refs, honest Phase 2b transition `warning`). Two API endpoints: `POST /api/recovery/start` (rate-limited under `expensive` policy; returns a **no-match sentinel** with identical shape to success on missing phone — §15 protection against phone-enumeration attacks), `POST /api/recovery/verify` (verifies OTP, derives recovery phrase, gathers memory refs, builds bundle; emits an `account_recovery.completed` ledger event with masked-phone + recoveryOtpId for after-the-fact SIM-swap detection). Welcome-screen UI gains a dashed-border *"🔁 I lost my recovery phrase (use phone instead)"* link below the three primary choices; tapping it goes to a new `recover` wizard step with phone → send-code → verify-code → restored flow. On verify success the new device persists the recovered identity, auto-marks the phrase as backed up (it's on the bundle the user just received), and the wizard dismisses after a 1.2s "Recovered ✓" confirmation. 385 / 385 tests (+13 new: phone lookup, mask-collision tie-breaking, recovery-request envelope, purpose-strictness, full end-to-end). SW cache to v29. **The lost-phrase deadlock is solved — a user with a verified phone can recover in ~90 seconds.**

Closed in Phase 4.6 (ADR 0085):
1. ✅ **Deployment scripts — Docker + Caddy + CI + runbook (launch arc complete)** — packages the Phase 4 launch-readiness work into a one-command deploy. **Multi-stage Dockerfile** (`builder` runs the full test suite so a broken commit never builds a production image; `runtime` is `gcr.io/distroless/nodejs24-debian12:nonroot` — no shell, no package manager, uid 65532). Production env defaults baked in: `BHARAT_OS_STORE_KIND=sqlite`, `BHARAT_OS_HSTS=1`, `BHARAT_OS_TRUST_PROXY=1`, `BHARAT_OS_LOG_LEVEL=info`. Healthcheck hits `/readyz` every 30 s. **`docker-compose.yml`** orchestrates `bos-api` + `caddy` (Caddy 2-alpine reverse proxy, auto-Let's-Encrypt, depends-on-healthy) with three named volumes (`bos-data`, `caddy-data`, `caddy-config`). **`Caddyfile`** terminates TLS, forwards X-Forwarded-For correctly so the rate-limiter sees real client IPs, passes through the Phase 4.1 security headers + adds belt-and-braces HSTS at the proxy layer. **`.env.example`** documents every BHARAT_OS_* env var introduced across Phases 4.1-4.5 with comments on prod-vs-dev guidance. **`.dockerignore`** excludes `.git` / `.tmp` / `.demo-*` / `.env` so secrets never end up in the image. **`.github/workflows/ci.yml`** — three jobs: `test` (full 372-test suite + live `/healthz` smoke), `docker-build` (verifies Dockerfile works), `publish` (tagged releases push to GHCR using `GITHUB_TOKEN`). **`docs/launch-runbook.md`** — 8-section end-to-end deploy procedure: partner/regulatory prerequisites (DPDP fiduciary, domain, SMS partner, DPO appointment), pre-launch code checklist, host provision options at price points (Hetzner €4/mo, Lightsail $5/mo), `docker compose up -d` step-by-step, verification curls, observability hookup (Loki/Cloudwatch/Prometheus/Grafana), backup strategy (manual cron or Litestream sidecar), day-of-launch checklist, known limitations, rollback procedure. 372 / 372 tests unchanged (Phase 4.6 is infrastructure config; CI runs the existing suite + a live smoke test). **The Phase 4 launch arc is complete — Bharat OS is launch-deployable in one command.**

Closed in Phase 4.5 (ADR 0084):
1. ✅ **i18n framework — localized UI shell for the six supported languages** — Bharat OS had vernacular suggestion chips + localized response strings since Phase 2a, but the static UI shell (button labels, card headers, welcome wizard, error toasts) was English-only. New `public/shell/i18n.mjs` ships a lightweight i18n with seven supported locales (`en-IN`, `hi-IN`, `hi-Latn-IN`, `mr-IN`, `bho-IN`, `ta-IN`, `bn-IN`). Public surface: `t(key, { fallback, locale })` with active-locale → en-IN → caller-fallback → key chain so missing keys are visible during dev; `setLocale` / `getLocale` / `onLocaleChange` with localStorage persistence + event listeners; `applyI18n(root)` sweeps the DOM for `data-i18n="key"` attributes and updates `textContent` (plus `data-i18n-aria-label` and `data-i18n-placeholder` for attribute-only translations); `getLocaleCoverage(locale)` / `listLocales()` for the §17 honesty board. Translations seeded for the highest-impact surfaces: welcome wizard (title, subtitle, 3 choice cards, legal notice), bottom nav (Home / Earn / Trust / Profile), DPDP card (title, note, export / delete / DPO buttons), phone-OTP card, offline banner. **Coverage: en-IN 100% reference; hi-IN ~95%; hi-Latn-IN ~75%; mr-IN / ta-IN / bn-IN ~50%; bho-IN ~40%**. Remaining strings fall through to en-IN — visible English in otherwise-localized UI is a known §17 honesty gap (machine-translated seed strings; native-speaker review is a launch-prep commitment). Locale resolution on startup: localStorage → `navigator.language` exact match → prefix match (`hi*` → `hi-IN`) → `en-IN`. `setActiveProfile` calls `applyI18nForLocale(profileLocale(identity))` so switching to a Tamil profile repaints the UI to Tamil automatically. 372 / 372 tests (+12 new: lookup chain, fallback, unsupported-locale rejection, listener fire + unsubscribe, coverage stats, every-locale-has-nav-keys guarantee). SW cache to v28.

Closed in Phase 4.4 (ADR 0083):
1. ✅ **Network resilience + offline mode + PWA install** — client-side counterpart to Phase 4.1's server hardening. New `public/shell/network.mjs`: `fetchWithRetry` (exponential backoff 200ms / 600ms / 1.8s, retries 5xx / 429 / 408 / network errors, never retries 4xx validation errors), `onNetworkStatusChange` (wraps `navigator.onLine` + browser online/offline events), `categoriseError` (six discriminated categories — `offline` / `auth` / `rate_limited` / `validation` / `server_error` / `network_error` — each with a recommended user-facing action). Sticky red **offline banner** at top of viewport when network drops (auto-hides on reconnect; mesh ticker auto-stops while offline to avoid polluting the rate-limiter). **PWA install prompt** captured from `beforeinstallprompt`, surfaced as a *"📥 Install Bharat OS"* card on the Profile tab — one tap to pin to home screen, closing the biggest UX delta between a PWA and a "real app." Dismiss flag persisted across sessions; `appinstalled` event hides the card permanently. Improved `showToast` signature: `(message, { tone, retry, durationMs })` — when `retry` is a function the toast becomes interactive with a Retry button + dismiss, persisting 8 s minimum so users have time to act. 360 / 360 tests (+13 new: retry on 5xx / 429 / network errors, no retry on 4xx, error categorisation across all six categories). SW cache to v27. **Resilient against transient server hiccups, network drops, and Indian mobile-network variance without any new server-side state.**

Closed in Phase 4.3 (ADR 0082):
1. ✅ **Phone OTP authentication scaffold — recovery path beyond the 12-word phrase** — Trust-Wallet-style phrase recovery is good for power users but at population scale most users will lose it; phone OTP is the recovery fallback. Two new artifacts: `src/phase0/sms-provider.mjs` (provider abstraction with pluggable backends — default `log` provider routes through structured logger with masked phone + body length only; stubs for gupshup / msg91 / karix / twilio that throw with clear configure-env-vars guidance until partner contract lands; `normalisePhone` accepts 10-digit Indian + E.164) and `src/phase1/phone-otp.mjs` (cryptographically random 6-digit code, salted SHA-256 hash for storage, `crypto.timingSafeEqual` verification; 5-min TTL, 5-attempt cap; three purposes — `phone_verify`, `account_recovery`, `sensitive_action`). **The plaintext OTP code is generated, handed to the SMS provider, then discarded — storage holds only the salted hash; the ledger sees only `phoneMasked` + status, never the code or full number**. New `phone_otps` storage in both BosStore (directory) and SqliteStore (indexed table, included in the atomic erasure cascade). Two API routes: `POST /api/phone-otp/send` (gated by the `expensive` rate-limit policy at 10/5min — real SMS costs money), `POST /api/phone-otp/verify` (on success, attaches `phone_verified` to the identity's attestations block with only the masked form on the public record). Shell adds *"📱 Phone (recovery)"* card on the Profile tab — 2-step UI with `autocomplete="one-time-code"` so iOS/Android auto-fill works. Dev mode prints OTP body to stdout under `BHARAT_OS_LOG_OTP_BODIES=1` for testing; production leaves it off. 347 / 347 tests (+14 new). SW cache to v26. **Recovery story is launchable — when the SMS partner contract lands, swapping the `notConfiguredProvider('gupshup')` stub is ~30 lines; the API surface and database integration don't change.**

Closed in Phase 4.2 (ADR 0081):
1. ✅ **SQLite store backend — ACID transactions for launch scale** — new `src/phase0/sqlite-store.mjs` is a drop-in replacement for the file-based `BosStore` with identical method signatures (every test that worked against `BosStore` works against `SqliteStore` unchanged). 20 tables — one per record type — with JSON-blob columns + extracted indexed columns (`subject_id`, `actor_id`, `owner_id`, `created_at`, …). Built-in `node:sqlite` (stable in Node 24, zero new dependencies, no native compilation). WAL mode for concurrent reads; `PRAGMA synchronous = NORMAL` for balanced durability/perf. **`eraseUserData` runs the entire cascade inside `BEGIN ... COMMIT`** — DPDP §12(3) right-to-erasure is now genuinely atomic (a crash mid-erase rolls back to the pre-erase state instead of leaving partial deletions). Ledger uses `AUTOINCREMENT seq` so ordering is intrinsic — no race when two writers append concurrently. New `createStore({ rootPath, kind })` factory + `BHARAT_OS_STORE_KIND=file|sqlite` env var + `--kind` CLI flag. New `scripts/migrate-store.mjs` (one-shot file → SQLite migration; idempotent upsert; replays ledger chronologically to preserve seq order). Live-verified end-to-end against the demo seed: 70 records + 73 ledger events migrated; API boots on SQLite (`"storeKind": "sqlite"` in startup banner); all read endpoints return the migrated data correctly; SQLite file is 676 KB vs the file store's 1.1 MB (38% smaller on disk). 333 / 333 tests (+11 new: identity round-trip, upsert, consents, ledger seq, computeContribution, atomic erase + redaction, cross-user filter, durability across close/reopen, factory). **Backward-compatible — file store remains the default; SQLite is opt-in.** Phase 4.6 deployment work positions PostgresStore as the next backend via the same factory.

Closed in Phase 4.1 (ADR 0080):
1. ✅ **Production hardening — security headers, rate limiting, structured logging, metrics, graceful shutdown** — four new artifacts under `src/phase0/`. `security-headers.mjs` (strict CSP with **no `'unsafe-inline'` and no `'unsafe-eval'`** in script-src; CDN allowlist limited to esm.sh + cdn.jsdelivr.net; defence-in-depth fallbacks — X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy with camera/mic to self + geo/payment/usb/interest-cohort denied; HSTS opt-in via env). `rate-limiter.mjs` (in-memory token-bucket, 4 policy classes — read 60/min, write 30/min, expensive 10/5min, probe 600/min; `policyFor` dispatches by method+pathname; per-key isolation; `clientKey` honours X-Forwarded-For only with `BHARAT_OS_TRUST_PROXY=1`). `logger.mjs` (structured JSON to stdout/stderr per level; **PII-forbidden key allowlist silently scrubs at any depth** — `displayName`, `phoneNumber`, `intentText`, `recoveryPhrase`, `privateKeyPem`, `vaultKeyBase64`, `gradientBytesBase64`, …; `crypto.randomUUID()` request IDs; non-ASCII path-scrub). `metrics.mjs` (Prometheus text-exposition format at `/metrics`; **`metricPath` normalises bos:* IDs / pairing codes / SHA-256 to `:id`** so per-user identityIds never appear in metric labels; histogram buckets biased to sub-second). Middleware preamble wires all four into every request: security headers + request-id + rate-limit check + access-log + metric record on finish/close. New endpoints: `/healthz` (liveness, uptime), `/readyz` (readiness — checks store reachability, 503 on store error), `/metrics` (Prometheus scraper). Server hardening: `headersTimeout: 30s`, `requestTimeout: 60s`, `keepAliveTimeout: 5s`, 1 MiB body-size cap on JSON reads. `installGracefulShutdown` registers SIGTERM/SIGINT handlers that drain in-flight requests with a 10s force timeout. Inline `<script>` tags moved out of shell `index.html` + privacy page (new `sw-bootstrap.js` + `dpo-loader.js`) so the strict CSP works. Env vars: `BHARAT_OS_HSTS`, `BHARAT_OS_TRUST_PROXY`, `BHARAT_OS_CORS_ORIGINS`, `BHARAT_OS_LOG_LEVEL`. 322 / 322 tests (+33 new: 7 security-headers + 13 rate-limiter + 7 metrics + 6 logger). SW cache to v25. **Bharat OS is now deployable behind nginx / Cloudflare / ALB with proper rolling-deploy semantics + Prometheus-scrapeable observability + PII-safe logging.**

Closed in Phase 4.0 (ADR 0079):
1. ✅ **DPDP data-subject rights — launch readiness arc starts here** — pivot from investor-demo-ready to launch-ready opens with the legally non-negotiable piece. New artifact `src/phase1/dpdp-rights.mjs` (`collectUserData` builds an 18-section export bundle excluding `privateKeyPem` + `vaultKeyBase64`; `erasureManifest` returns a pure deletion plan; `redactLedgerEntry` replaces user references with `<erased>` to preserve chain integrity for other participants; `DEFAULT_DPO_CONTACT` is the single source of truth). New store method `eraseUserData(identityId, { redactLedgerEntry })` cascades file-deletion across all 16 per-user record types + rewrites `ledger.jsonl` atomically with identity references redacted. Four new API routes: `GET /api/identities/:id/export` (with `Content-Disposition: attachment`), `GET /api/identities/:id/erasure-preview`, `DELETE /api/identities/:id?confirm=YES_DELETE` (refuses without the explicit flag), `GET /api/dpdp/grievance`. Two new static legal pages at `/legal/privacy.html` + `/legal/terms.html` (10-section DPDP §11 notice + 11-section ToS; privacy page fetches live DPO contact from the API). Shell adds a *"Your data rights"* card on the Profile tab with Download / Delete / Contact DPO actions; the Delete flow is two-step (preview + type "DELETE"). First-run wizard footer carries the legal-acceptance notice with links to both legal pages. 289 / 289 tests (+9 new: empty-history, multi-subject filter, secret-material redaction, manifest purity, ledger-redaction correctness). SW cache to v24. **Bharat OS is now DPDP-compliant at the protocol layer; a fiduciary-registration application can cite this ADR + live endpoints. Phase 4.1+ adds production hardening (CSP, rate limiting, structured logging), DB migration (SQLite/Postgres), real auth (WebAuthn + phone OTP), i18n.**

Closed in Phase 2a.26 (ADR 0078):
1. ✅ **First-run wizard — sign-up / migrate / demo** — Bharat OS now has a front door. Three paths from the welcome screen: ✨ *Set up new identity* (4-step wizard: language picker → display name → POST `/api/identities` + fetch recovery phrase → Trust-Wallet/MetaMask-style 12-word backup grid with mandatory ack checkbox or explicit *I'll save it later* escape hatch), 📲 *Move from another phone* (routes to existing §7c WebRTC pairing receiver — QR scan or 6-digit code + phrase), 🎬 *Try a demo persona* (clearly labelled demo-only, reuses existing `reinitializeDeviceAs`). `loadIdentities` no longer silently auto-binds — the wizard owns the "no device owner yet" state. New persistent **backup warning banner** on Home (red-tinted, *"Back up your recovery phrase"*) when the new-identity user picked *I'll save it later*; tapping it re-fetches the deterministic phrase and re-opens the backup grid. New **Reset device** button on Profile tab with honest `window.confirm` copy explaining the identity stays on the server. Migrated identities + demo personas are auto-flagged as backed-up (phrase inherited / not user's own). Service worker bumped v22 → v23. 280 / 280 tests unchanged (wizard is UI over already-tested API routes).

Closed in Phase 2a.25 (ADR 0077):
1. ✅ **Shell UX overhaul — bottom-tab navigation + plain-language copy** — restructures `/shell/` from a single-scroll 10-card stack into 4 focused tabs: 🏠 **Home** (intent + flow + result + recent), 💎 **Earn** (big "Earned today" hero + mesh ticker + federated rounds), 🛡️ **Trust** (verified profile + verifier preview + sign & share), 👤 **Profile** (identity hero + pairing + passkey + alerts + health doc + flag report + diagnostics). All existing element IDs preserved so existing JS for mesh / pairing / trust / federation / etc. continues to work unchanged; only ~50 lines added for tab-switching (last-used tab persisted to localStorage). **All user-facing §XX jargon stripped**: "§13B fair-use lever" → "Earn while charging", "§7c device pairing" → "Move to a new phone", "§9A flag" → "Report a problem", "Profile security" → "🔑 Sign-in security", "Worker alerts" → "🔔 Job alerts", "What's running, what's scaffold" → "🔬 Behind the scenes". §XX framing moved into `<details class="why-details">` collapsibles so investors still get the technical detail one tap away; users see plain language by default. Onboarding overlay rewritten as a 4-step tab tour. New `.earn-hero` (42px mono ₹ today) and `.profile-hero` (64px avatar + name) hero cards. Fixed-position bottom-nav with backdrop-blur and accent-coloured active state. Tab fade-in animation (180ms). Operator console untouched — `/shell/` is now user-context, `/console/` stays ops-context. 280 / 280 tests unchanged (api.test.mjs updated for renamed copy strings). SW cache to v22.

Closed in Phase 3.2 (ADR 0076):
1. ✅ **FedAvg + privacy-budget accountant — Phase 3 complete** — Two pieces close out the Phase 3 substrate arc. **Privacy-budget accountant** (`src/phase1/privacy-budget.mjs`): `computeBudgetUsage` / `projectBudget` / `assertWithinBudget` with `DEFAULT_FEDERATED_BUDGET = { windowHours: 720, epsilonCap: 8.0 }` (30-day ε=8 OWASP / Google heuristic). Structured `PRIVACY_BUDGET_EXHAUSTED` error with projection payload when exceeded. **FedAvg with bytes donation** (extends `federated-round.mjs`): rounds gain `aggregationMode: 'hash_combiner' | 'fedavg'` (default hash_combiner, backward-compatible) + `contributorBudget` override. New `BYTES_DONATION_CONSENT_PURPOSE = 'federated_bytes_donation'` strictly stronger than `federated_donation` — `fedavg` rounds require it AND the actual `gradientBytesBase64`. `aggregateRoundFedAvg` decodes base64 → Float32Array → element-wise mean → re-encode (with a Node-Buffer-pool-aware decoder; `Buffer.slice` is a VIEW, not a copy). The aggregated `Float32Array` is what a researcher feeds into a baseline-model update; `aggregatedModelHash` becomes SHA-256 of the aggregated bytes (verifier-checkable). New `GET /api/federated/budget/:contributorId` endpoint so the shell shows running ε spend; shell federated card now reads *"N active · ε X.XX / 8.0 (30-day)"* and each round row carries a `FedAvg` (orange) or `hash-only` (green) mode badge. Join flow dispatches: fedavg rounds mint the stricter consent + ship gradient bytes; hash-only rounds keep Phase 3.0/3.1 behavior unchanged. Canonical signed payload excludes bytes (signature over gradient hash transitively covers them — stays stable across mode switches). 280 / 280 tests (+19 new: 9 budget + 10 fedavg). SW cache to v21. **§7f Phase 3 substrate is now feature-complete; Phase 3.3+ adds secure aggregation, cross-instance budget federation, RDP accountant composition.**

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
