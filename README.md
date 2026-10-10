<div align="center">

**Stops you from trusting one model's answer without seeing where other models disagree.**

[![CI](https://github.com/entropyvortex/roundtable/actions/workflows/ci.yml/badge.svg)](https://github.com/entropyvortex/roundtable/actions/workflows/ci.yml)

![RoundTable Run view: the brief (score, judge verdict, where they split, who moved) beside the transcript](screenshots/screenshot.jpeg)

Used in real Vortex Serviços and SabIA production work to stress-test decisions before they ship.

Tests and CI: ESLint, Prettier, the unit tests and a production build run on every push and pull request.

> **AI Experiment / Showcase** — This project is built for educational and research purposes. It demonstrates how multiple AI models can be orchestrated into structured consensus processes. Not intended for production decision-making.

# RoundTable

### Multi-AI Consensus Playground

**Ask a panel of AI models one question. Get an answer-first brief: where they agree, where they split, and how sure they are.**

RoundTable puts one question to a panel of AI models and returns a brief rather than a transcript. Three engines are available: the **Consensus Validation Protocol (CVP)**, a multi-round debate; a **Blind Jury**, where each model answers once without seeing the others; and an **Adversarial Red Team**, where a rotating attacker stress-tests every position. A panel can mix any OpenAI-compatible providers (Grok, Claude, GPT, Gemini, Mistral and others), with a built-in or custom persona per seat. The app estimates calls, cost and time before a run. Afterwards the brief leads with the consensus score, the judge's verdict, claim-level contradictions quoted from the transcript, and who changed their mind. Completed runs are saved in the browser, where they can be reopened, re-run or compared, and an engine sweep runs one question through all three engines and tabulates the results.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/new/clone?repository-url=https://github.com/entropyvortex/roundtable)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)

</div>

---

## What is RoundTable?

RoundTable is an open-source web application that orchestrates structured multi-round debates between AI models. Instead of asking one model and hoping for the best, RoundTable forces multiple models to:

1. **Analyze** a topic independently
2. **Challenge** each other's reasoning
3. **Assess** the strength of evidence presented
4. **Synthesize** a final consensus position

Each model is assigned a persona (Risk Analyst, First-Principles Engineer, Devil's Advocate, etc.) that shapes how it approaches the discussion. The result is a richer, more robust analysis than any single model can produce alone.

No database. No auth. No external services. Just add your API keys and go.

---

## Screenshot

_Dark theme shown; the app follows your system preference and has a light theme ([screenshot](screenshots/screenshot-light.jpeg))._

The app has three views: **Setup** (question, panel, protocol, estimate), **Run** (the brief beside the transcript, plus the engine comparison after a sweep) and **History** (saved runs, search, notes, compare two).

## Consensus Validation Protocol

### Purpose

A single language model produces a single distribution over tokens. It has no mechanism to check its own reasoning against an independent perspective. The Consensus Validation Protocol (CVP) addresses this by running multiple models — each constrained to a distinct analytical persona — through a structured sequence of rounds where they must respond to each other's arguments. The goal is not to produce a "correct" answer by majority vote, but to surface disagreements, stress-test reasoning, and force each participant to update its position in light of criticism.

The result is a scored collection of final perspectives, not a merged conclusion. The human reader is the ultimate synthesizer.

### How It Works

CVP runs up to a configured number of rounds (1–10, default 5). Each round has a designated type that constrains what participants are asked to do. From Round 2 onward, participants are processed **sequentially within each round** — later participants in a round see earlier participants' responses from that same round, in addition to all responses from prior rounds. Round 1 runs in **parallel with no cross-visibility** by default (toggleable via the "Blind Round 1" option) so the first wave of analysis is not contaminated by whoever happened to answer first.

**Round phases:**

1. **Initial Analysis** (Round 1) — Each participant provides an independent analysis of the prompt, shaped by its assigned persona. With "Blind Round 1" enabled (the default) every participant answers in parallel with no visibility into any other participant. Each response must end with a self-assessed confidence score (0–100).

2. **Counterarguments** (Round 2) — Each participant reviews all Round 1 responses and identifies weaknesses, challenges assumptions, and highlights logical gaps. Confidence scores are updated.

3. **Evidence Assessment** (Round 3) — Participants evaluate the strength of evidence presented so far, distinguish well-supported claims from speculation, and identify areas of emerging agreement.

4. **Synthesis** (Rounds 4 through N) — Participants synthesize the discussion, acknowledge remaining uncertainties, and refine their positions. The final round is labeled "Final Synthesis" in the prompt, signaling participants to commit to a concluding position.

**Randomised order.** From Round 2 onward, participant order is shuffled per round by default to prevent the first-mover from disproportionately framing each round. Toggleable via the "Randomize order" option.

**Early stopping.** When the consensus score delta between two consecutive rounds drops to ≤ 3 points, the engine emits an `early-stop` event and terminates the run before exhausting all configured rounds. This is on by default and saves cost on runs that converge quickly. Toggleable via the "Early stop" option.

**Persona injection:** Each participant's system prompt is prepended with a persona definition (e.g., "You are a Risk Analyst. Your role is to surface hidden dangers, tail risks, and second-order effects."). Personas are defined server-side in `lib/personas.ts` and cannot be modified by the client.

**Confidence extraction:** Every response is expected to end with `CONFIDENCE: [0-100]`. A regex extracts this value. If absent, confidence defaults to 50.

**Consensus scoring:** After each round, a consensus score is computed:

```
consensus_score = avg(confidence) - 0.5 * stddev(confidence)
```

High average confidence with low variance yields a high score. Disagreement (high variance) penalizes the score even if individual confidences are high.

**Disagreement detection:** After each round the engine scans every pair of participants. Any pair whose confidence diverges by ≥ 20 points is recorded in the disagreement ledger and surfaced live in the UI. The detection is intentionally deterministic and cheap — no extra LLM calls — which makes it robust to rate limits and reproducible across runs.

**Judge synthesis (optional):** When "Judge synthesis" is enabled, a dedicated non-voting model reads every participant's final-round response and produces a structured synthesis with four sections: **Majority Position**, **Minority Positions**, **Unresolved Disputes**, and **Synthesis Confidence**. The judge is forbidden from picking a winner or collapsing conditional minority views into the majority. Its output streams live to the UI and is included in all exports.

**Cost meter.** Every call is attributed to a participant and priced against the client-side table in `lib/pricing.ts`. The live meter shows total tokens (in/out) and estimated USD; totals include the judge. When the Vercel AI SDK reports token usage, the meter uses it directly; otherwise it falls back to a 4-chars-per-token heuristic.

**Provider error resilience.** When a participant's underlying provider call fails — wrong base URL, invalid API key, unknown model, upstream outage, 404 from a mismatched endpoint, you name it — the engine catches the error via the Vercel AI SDK's `onError` callback, formats it with the HTTP status code when available, logs the full error object server-side, and emits a `participant-end` event with an `error` field. The client renders that response as a red error card with the upstream message (not the usual content card), fires a toast identifying which provider/model broke, and **excludes the errored response from both the consensus score and the disagreement ledger**, so one broken provider can no longer tank the run. The remaining participants continue normally.

### Protocol Diagram

```text
User Prompt + Round Count + Participant Config
    |
    v
┌─────────────────────────────────────────────┐
│  Round 1: Initial Analysis                  │
│                                             │
│  [Persona A / Model X] ──→ Response + Conf  │
│  [Persona B / Model Y] ──→ Response + Conf  │  (sequential; B sees A's response)
│  [Persona C / Model Z] ──→ Response + Conf  │  (C sees A's and B's responses)
│                                             │
│  consensus_score = avg(conf) - 0.5*std(conf)│
└─────────────────────┬───────────────────────┘
                      │ all responses passed forward
                      v
┌─────────────────────────────────────────────┐
│  Round 2: Counterarguments                  │
│                                             │
│  Each participant receives ALL prior round  │
│  responses and must challenge assumptions.  │
│  Updated confidence scores.                 │
└─────────────────────┬───────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────┐
│  Round 3: Evidence Assessment               │
│                                             │
│  Evaluate evidence quality.                 │
│  Distinguish supported claims from          │
│  speculation. Updated confidence scores.    │
└─────────────────────┬───────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────┐
│  Rounds 4–N: Synthesis                      │
│                                             │
│  Refine positions. Final round prompts for  │
│  a concluding stance. Final confidence.     │
└─────────────────────┬───────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────┐
│  Output                                     │
│                                             │
│  Final consensus score (last round only)    │
│  All individual final-round responses       │
│  Per-participant confidence trajectories    │
│  No auto-merged conclusion — human reviews  │
└─────────────────────────────────────────────┘
```

### Blind Jury Engine (alternative)

RoundTable also ships a **Blind Jury** engine alongside CVP. Where CVP is a multi-round debate, Blind Jury is a single-pass evaluation:

1. Every participant answers the same prompt **in parallel**, with no cross-visibility into any other answer.
2. A judge model synthesizes majority, minority, and unresolved positions from the independent responses.
3. A disagreement ledger is computed from the pairwise confidence spread, exactly as in CVP.

Blind Jury is the right engine when you want _independent_ signals rather than a negotiated consensus. Because there is no sequential visibility, it is immune to the anchoring bias that CVP needs randomized order and blind Round 1 to mitigate. It is also cheap: one API call per participant, plus one for the judge.

Switch engines in the Protocol section of Setup. The Blind Jury engine ignores the round count and the CVP-specific toggles.

### Adversarial Red Team Engine (alternative)

The third engine pressure-tests positions before producing a final synthesis. Where CVP rewards consensus and Blind Jury rewards independent signal, Red Team rewards _robustness_ — every claim has to survive a hostile probe before it gets credit.

1. **Round 1 — Initial Positions.** Every participant emits their position in parallel with no cross-visibility, warned in advance that their position will be attacked. They are asked to state load-bearing claims explicitly so they can be challenged.

2. **Rounds 2 to N-1 — Stress Tests.** One participant per round is the **attacker** (round-robin via `pickAttackerIndex(round, participantCount)`). The attacker turn is special: their persona is _suspended_ for the round and replaced with a "neutral red-team attacker" framing that demands they begin with `Attacking claim: <verbatim quote>` and surface the weakest load-bearing claim. The remaining participants are **defenders** and respond to the attack **in parallel** (same anti-anchoring philosophy as Blind Round 1) — they cannot see other defenders' replies.

3. **Round N — Post-Stress Final Synthesis.** Every participant in parallel writes their final position, explicitly acknowledging which attacks landed, which missed, and what conditional caveats they now attach.

The attacker's confidence score reports how confident they are that the attack lands — not their belief in any underlying view. This is **out-of-band** for the consensus formula, so stress-round scores and disagreement detection are computed from defender responses only, keeping the `avg − 0.5·stddev` interpretation consistent with CVP and Blind Jury.

Switch engines in the Protocol section of Setup. Red Team uses the rounds setting with a minimum of 3 rounds (opening positions, at least one stress round, final synthesis); a lower setting is raised to 3 in the Setup stepper, in the estimate and in the request.

### Engine Sweep Mode

Click **Run all three engines** instead of **Run** to send the same question through CVP, Blind Jury and Adversarial Red Team in sequence. While it runs, the Run view header shows the current leg ("Engine 2 of 3 · Blind jury"). When it finishes, the **Compare engines** table has one row per engine: final score and label, contradiction count, confidence-spread flag count, the judge's majority excerpt, and the cost and token subtotal. Open a row to load that engine's run; the header then names that engine, the table stays, and your Setup options are left unchanged. Each leg is saved to History under its own engine, and exports and permalinks name the engine that produced the run on screen. The Red team leg always runs at least 3 rounds. The point is to make the protocol space visible: the same question may converge under one engine and split under another.

Sweep is sequential to respect rate limits; Esc or the Stop button tears down the active run while preserving any engines that already completed. Because a sweep is roughly 3× the cost of a single run, the pre-run estimate shows the sweep total and the **cost cap** in the Protocol section is the recommended companion control.

### Custom Persona Builder

The persona menu now includes a **Build a custom persona…** entry. Instead of free-text, the builder exposes six axes — Risk tolerance, Optimism, Evidence bar, Formality, Verbosity, Contrarian streak — each with three levels (low / mid / high). The server composes the system prompt from a small library of vetted phrase fragments, one per `(axis, level)`. The user-typed name is sanitised to a Unicode-letter / digit / space / `._-'` allowlist and capped to 32 chars; user-typed prompt text never reaches the LLM.

This preserves the existing security model: every consensus request rebuilds personas server-side from their IDs, and a custom persona's spec is re-sanitised and re-composed on every run. The spec is cached in `localStorage` so the user can iterate across sessions; it is **not** embedded in URL-hash permalinks (the spec is, the composed prompt is, but neither carries arbitrary text).

### Claim-Level Disagreement Extraction

The confidence-spread `Disagreement` ledger only catches pairs whose self-reported confidence diverges by ≥20 points. After every run with **Claim extraction** enabled (default ON), an additional LLM pass reads the final-round responses and emits a strict JSON object of `{contradictions: [{claim, sides: [{stance, participantIds, quote}]}]}`. The parser:

- Drops contradictions with empty claims, fewer than 2 sides, or sides without a quote.
- Verifies each quote against the actual response content of the named participants. If the (normalised) first 80 characters don't appear in any cited participant's text, the side is dropped — fabricated quotes don't render.
- Rejects entries where any participant id appears on more than one side.
- Caps to 8 contradictions per run.

The result renders in the brief's **Where they split** section with one card per contradiction, a colored stripe per side, the stance label, the participants involved, and the verbatim quote. Click a side to scroll to that participant's final-round response. If the extractor itself fails (provider error, model unavailable), a distinct red error card explains what happened — the run is unaffected.

The extractor reuses the judge model when judge synthesis is enabled (single user choice, no extra picker); otherwise it falls back to the first participant's model.

### Cost Cap

A numeric "Cost cap" input in the Protocol section's Advanced options hard-aborts the run if the running estimated cost crosses the threshold. The engine accumulates `runningCostUSD` after every round, judge call, and claim-extraction call; on cross, it throws `CostCapExceededError` which the SSE pipeline surfaces as an `error` event. The cap is server-clamped to ≤ $50.

### Why This Is Better Than Majority Vote

Majority vote asks N models the same question and picks the most common answer. CVP does something structurally different:

- **Persona diversity forces coverage.** A Risk Analyst and an Optimistic Futurist will examine different failure modes and opportunities from the same prompt. This isn't random variation — it's directed exploration of the problem space.

- **Sequential visibility creates dialogue.** Because participants within a round see earlier responses, later participants can directly respond to specific claims. This is closer to a structured debate than independent polling.

- **Multi-round iteration forces updating.** A model that states high confidence in Round 1 must confront counterarguments in Round 2 and defend or revise in subsequent rounds. The protocol mechanically prevents "fire and forget" responses.

- **Confidence variance detects real disagreement.** The consensus score penalizes high-confidence disagreement. If three models each claim 95% confidence but on different conclusions, the score drops. This surfaces cases where naive voting would mask genuine uncertainty.

- **The human sees everything.** CVP does not collapse the debate into a single answer. All intermediate reasoning is visible, streamed in real-time. The reader can trace exactly where participants agreed, where they diverged, and why.

### Failure Modes

**Shared hallucinations.** If all underlying models share the same training-data blind spot, personas will not fix it. A Risk Analyst running on GPT-4o and a Scientific Skeptic running on GPT-4o share the same parametric knowledge. Cross-provider diversity (e.g., mixing Grok, Claude, and Gemini) partially mitigates this, but cannot eliminate it.

**Prompt bias propagation.** The user's prompt frames the debate. If the prompt contains a false premise, all participants may accept it. Personas like First-Principles Engineer and Scientific Skeptic are designed to push back, but their effectiveness depends on the model's ability to detect the bias.

**Sycophantic convergence.** Models still tend to agree with prior responses, especially in later rounds. "Blind Round 1" and "Randomize order" reduce this bias but do not eliminate it — the last participant of any sequential round still sees the most prior context and may anchor to the emerging consensus rather than independently evaluating. Blind Jury avoids this failure mode entirely at the cost of giving up multi-round refinement.

**Cost scales linearly.** Each participant makes one API call per round. With 4 participants and 5 rounds, that is 20 API calls per consensus run, plus one for the judge if enabled. At 1,500 tokens per response, a single run can consume 30,000+ output tokens across providers. Early stopping and Blind Jury are the easiest levers to lower cost; the pre-run estimate and the cost breakdown in the Run view make this concrete before and during a run.

**Confidence scores are self-reported.** Models assign their own confidence. There is no calibration, no ground truth, and no penalty for overconfidence. The consensus score is only as meaningful as the models' ability to self-assess — which is known to be unreliable. The judge synthesizer is deliberately _not_ a calibrator: it summarises what was said, it does not grade it.

**Disagreement heuristic is confidence-based.** The default disagreement ledger flags pairs whose confidence diverges by ≥ 20 points. This catches loud splits but misses cases where two participants hold opposite positions with identical confidence. The **claim-level extractor** addresses this gap by running an additional LLM pass that emits structured contradictions with verbatim quotes per side; quotes are verified against actual response content so fabricated claims are dropped. The confidence-spread ledger remains as a fast, deterministic, no-extra-LLM-call lower bound.

### Example Transcript

This is a simplified reconstruction of how a 3-participant, 3-round run behaves based on the actual code path. The prompt is: _"Should a startup use microservices from day one?"_

**Round 1 — Initial Analysis:**

> **Risk Analyst (Grok):** Microservices introduce distributed systems complexity — network partitions, eventual consistency, deployment orchestration — before the team has validated product-market fit. Premature optimization of architecture is a top-5 startup killer. CONFIDENCE: 85

> **Optimistic Futurist (Claude):** Starting with microservices positions the team for scale from day one. The tooling has matured — Kubernetes, service meshes, and managed cloud services reduce the operational burden significantly. CONFIDENCE: 75

> **First-Principles Engineer (GPT-4o):** The question conflates architecture with deployment strategy. A modular monolith can be decomposed later. The real constraint is team size — a 3-person team cannot operate 8 services. CONFIDENCE: 90

_Consensus score: 80 (avg=83.3, stddev=6.2)_

**Round 2 — Counterarguments:**

> **Risk Analyst:** The Optimistic Futurist overstates tooling maturity. Kubernetes is not "reduced complexity" — it's traded complexity. Agree with First-Principles on the team-size constraint. Revising slightly upward. CONFIDENCE: 88

> **Optimistic Futurist:** The First-Principles argument about modular monoliths is valid. However, decomposing a monolith later is not free — the argument assumes clean module boundaries that rarely exist in practice. Lowering confidence. CONFIDENCE: 65

> **First-Principles Engineer:** Risk Analyst's point about premature optimization aligns with my position. The Futurist raises a fair concern about decomposition cost, but this is solvable with discipline. Maintaining position. CONFIDENCE: 88

_Consensus score: 77 (avg=80.3, stddev=10.7 — variance increased due to Futurist's drop)_

**Round 3 — Evidence Assessment / Final Synthesis:**

> **Risk Analyst:** The evidence pattern across rounds: 2/3 participants favor monolith-first. The Futurist's tooling argument was partially conceded. Remaining disagreement is about decomposition cost — a real but secondary concern. CONFIDENCE: 90

> **Optimistic Futurist:** I concede the monolith-first approach is lower-risk for most startups. My position narrows to: startups with **known scale requirements** (e.g., real-time data pipelines) may justify early microservices. CONFIDENCE: 70

> **First-Principles Engineer:** Consensus is forming around monolith-first with clean boundaries. The Futurist's exception for known-scale cases is reasonable and worth noting. CONFIDENCE: 92

_Final consensus score: 81 (avg=84, stddev=9.8)_

The human reader sees three final positions that largely converge but preserve the Futurist's conditional exception — something a majority vote would have discarded.

### Still Open

The following are deliberate non-goals for v1 but would further tighten the protocol:

1. **Confidence calibration or external validation.** Self-reported confidence is unreliable. A calibration step — comparing stated confidence to accuracy on known-answer questions — or a separate judge model that _grades_ argument quality (as opposed to the current faithfulness-only synthesizer) would add grounding.

2. **Additional pluggable engines.** Adversarial Red Team is available; Delphi, Ranked Choice, and Dialectical variants are still on the Roadmap. The engine interface is clean enough that adding a new one is one new function plus a dispatcher branch.

3. **Cross-engine judge synthesis.** Engine sweep currently runs an independent judge per engine. A meta-judge that synthesises across all three engines' final rounds would surface "what every protocol agrees on" but is deferred — per-engine judges produce intentionally engine-specific outputs (e.g. CVP's "Majority Position" is semantically different from Adversarial's post-stress majority).

## Security

This is an experimental research demo with **no authentication**. Anyone who can reach the URL can spend your provider keys. Read [SECURITY.md](SECURITY.md) before deploying.

The codebase has been built with defense-in-depth in mind — server-side persona rebuilds (the client cannot inject a `systemPrompt`), an axis-only custom-persona builder (no user free-text reaches the LLM), per-IP rate limiting, server-side input validation, an optional cost cap that hard-aborts a run when the running estimate crosses a USD threshold, and a strict claim-extractor parser that rejects fabricated quotes. Details and threat model in [SECURITY.md](SECURITY.md).

---

## Features

| Feature                                 | Description                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Answer-first Brief**                  | The Run view leads with the consensus score and a plain-language label (Strong agreement · Broad agreement with reservations · Split · Deep disagreement), then the judge's verdict, where the panel split (claim-level contradictions), and who moved — with the full transcript beside it (tabs on phones) |
| **Multi-Provider**                      | Connect any OpenAI-compatible API — Grok, Claude, OpenAI, Mistral, Groq, Together, and more                                                                                                                                                                                                                  |
| **Three Engines**                       | **CVP** (multi-round debate), **Blind Jury** (parallel independent responses + judge synthesis), and **Adversarial Red Team** (rotating attacker stress-tests positions before a post-stress synthesis) — picked in Setup from three plain-language cards                                                    |
| **Pre-run Estimate**                    | Before you run: calls, rounds, a low–high USD range and minutes for the current panel and engine (and for all three engines). Assumptions are listed next to the number; Run stays disabled with a plain reason ("Add at least 2 seats", "Write a question") until the run is valid                          |
| **Run History**                         | Every completed run (and every engine of a sweep) is saved automatically in your browser (`localStorage`, up to 50). Search, filter by engine, add notes, export, delete, and reopen a run to read or re-run it                                                                                              |
| **Compare Runs**                        | Pick two saved runs for a side-by-side table: score, judge majority, contradictions, panel, cost, and each participant's final confidence                                                                                                                                                                    |
| **Engine Sweep**                        | One click runs the same question through all three engines in turn; a **Compare engines** table shows score, label, contradictions, spread flags, judge majority, cost and tokens per engine, and opens any engine's full run                                                                                |
| **7 Built-in Personas + Panel Presets** | Risk Analyst, First-Principles Engineer, VC Specialist, Scientific Skeptic, Optimistic Futurist, Devil's Advocate, Domain Expert — or a preset panel (Balanced, Red team, Investor lens) spread across your providers                                                                                        |
| **Custom Persona Builder**              | Build session-scoped personas by tuning six axes (risk tolerance, optimism, evidence bar, formality, verbosity, contrarian streak) — server composes the prompt from vetted phrase fragments, no user free-text reaches the LLM, no jailbreak surface                                                        |
| **Blind Round 1**                       | CVP's first round runs in parallel with zero cross-visibility so the first wave of analysis is not contaminated by speaking order                                                                                                                                                                            |
| **Randomized Order**                    | CVP shuffles participant order in rounds 2+ to kill first-mover anchoring bias                                                                                                                                                                                                                               |
| **Early Stopping**                      | CVP detects convergence between rounds and terminates early, saving latency and tokens                                                                                                                                                                                                                       |
| **Judge Synthesizer**                   | Optional non-voting model that produces a structured **Majority / Minority / Unresolved / Confidence** summary over the final-round answers                                                                                                                                                                  |
| **Claim-Level Disagreement Extractor**  | LLM pass after the final round emits structured `{claim, sides[{stance, participants, verbatim quote}]}`. Quotes are verified against actual response content (fabricated quotes are dropped); same-participant-on-multiple-sides is rejected. Click a side to jump to that participant's response           |
| **Who Moved + Confidence Trajectory**   | Each participant's first → last confidence with the delta, biggest shift first, plus a per-participant trajectory chart so you can _see_ drift, convergence, and sycophancy                                                                                                                                  |
| **Confidence-Spread Flags**             | Deterministic detector for pairs whose confidence differs by 20+ points, grouped by round — click to open that round in the transcript                                                                                                                                                                       |
| **Cost Breakdown + Cost Cap**           | Total tokens and estimated USD per run, split by seat, judge and claim extraction, from a bundled pricing table. Optional hard-abort cost cap (USD) tears down the run as soon as the running estimate crosses the threshold                                                                                 |
| **Transcript**                          | Round-by-round navigation with each round's score, one card per participant (confidence, duration, tokens), live token streaming, a "Final positions" shortcut, and a per-participant filter                                                                                                                 |
| **Provider Error Handling**             | Errored participant calls render as danger cards with the upstream message + HTTP status, fire a per-participant toast, and are excluded from the consensus score and disagreement flags so one broken provider can't tank a run                                                                             |
| **Example Questions**                   | Curated example questions, grouped by category, under the question box for first-time visitors                                                                                                                                                                                                               |
| **Session Export & Share**              | Download as Markdown or JSON (includes the claim digest), plus a permalink that encodes the full run into the URL hash (compressed when available)                                                                                                                                                           |
| **Shared View Mode**                    | Loading a `#rt=…` permalink opens the run read-only in the Run view for review, embedding, or screenshots                                                                                                                                                                                                    |
| **Real-time SSE Streaming**             | Responses arrive token-by-token; the brief fills in as each round, the judge and the claim extraction land. Switching views never interrupts a run                                                                                                                                                           |
| **Keyboard-Operable Pickers**           | Provider → model cascade and persona menus work with arrow keys, Enter and Escape; every control has a visible focus ring                                                                                                                                                                                    |
| **Copy to Clipboard**                   | One-click raw markdown copy per response                                                                                                                                                                                                                                                                     |
| **Cancel Anytime**                      | Stop button + Escape key — single-engine cancels the current run; sweep mode cancels the entire sweep while preserving any engines that already completed                                                                                                                                                    |
| **Light / Dark Themes**                 | Follows the system setting by default; the header toggle cycles system → light → dark and remembers your choice. Flat, readable, 14px+ body text, reduced-motion aware                                                                                                                                       |
| **Rate-Limited API**                    | In-memory per-IP rate limiting, server-side input validation, persona/model re-verification                                                                                                                                                                                                                  |
| **No External Services**                | No database, no auth service — run history lives in your browser. Vercel-deployable in one click                                                                                                                                                                                                             |

---

## Quick Start

```bash
git clone https://github.com/entropyvortex/roundtable.git
cd roundtable
pnpm install
```

Copy the example environment file and add your API keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your keys, then:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). In **Setup**, write a question or pick an example, then build the panel: add seats and choose a persona and model for each, apply a preset, or build a custom persona with the axis sliders. Choose an engine under **Protocol** (Debate / CVP, Blind jury or Red team); the **Advanced** section holds rounds, blind round 1, randomized order, early stop, judge synthesis, claim extraction and the cost cap. The bar at the bottom shows the estimated calls, cost and time. Press **Run**, or **Run all three engines** for a sweep. The **Run** view streams the brief beside the transcript, and **Export** downloads Markdown or JSON or copies a permalink that reopens the run read-only. Every completed run lands in **History**, where it can be reopened, re-run, annotated or compared with another.

---

## Configuration

RoundTable uses a single `AI_PROVIDERS` environment variable containing a JSON array. Each provider specifies a base URL, API key reference, and available models.

### Provider Format

```json
[
  {
    "id": "grok",
    "name": "Grok",
    "baseUrl": "https://api.x.ai/v1",
    "apiKey": "env:GROK_API_KEY",
    "models": ["grok-3", "grok-4-0709"]
  },
  {
    "id": "claude",
    "name": "Claude",
    "baseUrl": "https://api.anthropic.com/v1",
    "apiKey": "env:ANTHROPIC_API_KEY",
    "models": ["claude-sonnet-4-20250514"]
  },
  {
    "id": "openai",
    "name": "OpenAI",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "env:OPENAI_API_KEY",
    "models": ["gpt-4o"]
  }
]
```

### API Key Resolution

The `apiKey` field supports two formats:

| Format           | Example              | Behavior                                                       |
| ---------------- | -------------------- | -------------------------------------------------------------- |
| `"env:VAR_NAME"` | `"env:GROK_API_KEY"` | Reads the value from the named environment variable at runtime |
| Literal string   | `"xai-abc123..."`    | Uses the value directly (not recommended for production)       |

API keys are resolved server-side only and never exposed to the browser. All AI calls go through Next.js API routes.

### Endpoint compatibility

All consensus calls go through the **OpenAI chat completions** endpoint (`POST /chat/completions`), not the newer OpenAI Responses API. This is deliberate: `/chat/completions` is the one endpoint every provider's OpenAI-compat shim actually implements. In code we pin this by using `provider.chat(modelId)` instead of the default `provider(modelId)` — the latter targets `/responses`, which is OpenAI-only.

That means your `baseUrl` should be the provider's base that serves `/chat/completions`:

| Provider   | Base URL                         | Notes                                                                                                                                                                   |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI     | `https://api.openai.com/v1`      | Native endpoint.                                                                                                                                                        |
| Anthropic  | `https://api.anthropic.com/v1`   | Requires Anthropic's [OpenAI-SDK compatibility layer](https://docs.anthropic.com/en/api/openai-sdk). Models include `claude-sonnet-4-20250514`, `claude-opus-4-1`, etc. |
| xAI (Grok) | `https://api.x.ai/v1`            | Native OpenAI-compatible.                                                                                                                                               |
| Groq       | `https://api.groq.com/openai/v1` | Native OpenAI-compatible.                                                                                                                                               |
| Together   | `https://api.together.xyz/v1`    | Native OpenAI-compatible.                                                                                                                                               |
| Mistral    | `https://api.mistral.ai/v1`      | Native OpenAI-compatible.                                                                                                                                               |

If a provider only ships a dedicated SDK with no `/chat/completions` shim, it is not currently supported.

### Adding a New Provider

Any OpenAI-compatible API works. Add an entry to the `AI_PROVIDERS` array with the correct `baseUrl` and you're done. Examples:

```json
{
  "id": "groq",
  "name": "Groq",
  "baseUrl": "https://api.groq.com/openai/v1",
  "apiKey": "env:GROQ_API_KEY",
  "models": ["llama-3.3-70b-versatile"]
}
```

```json
{
  "id": "together",
  "name": "Together",
  "baseUrl": "https://api.together.xyz/v1",
  "apiKey": "env:TOGETHER_API_KEY",
  "models": ["meta-llama/Llama-3-70b-chat-hf"]
}
```

---

## Architecture

```
app/
  api/
    consensus/route.ts       SSE streaming endpoint — validates options & dispatches to the engine
    providers/route.ts       Returns client-safe model list (no secrets)
  page.tsx                   AppShell + Setup / Run / History; SSE processor, sweep, Stop/Esc, permalinks, history auto-save
  layout.tsx                 Root layout — Inter font, pre-paint theme script, Sonner toasts
  globals.css                Design tokens (light + dark) and markdown prose styles
components/
  AppShell.tsx               Sticky header: logo, Setup · Run · History (n) tabs, theme toggle
  ui/                        Primitives — Button, Card, Field, Toggle, Tabs, Segmented, Menu, Popover,
                             Badge, Tooltip, Skeleton, EmptyState, ThemeToggle, Logo, PersonaDot
    roving.ts                Keyboard helpers for roving-tabindex lists and menus
    theme.ts                 Theme preference (system / light / dark) in localStorage + data-theme
    theme-script.ts          Server-safe pre-paint script that applies the saved theme
  setup/
    SetupView.tsx            Question → Panel → Protocol → Estimate + Run, in one column
    QuestionEditor.tsx       Question box, character count, example chips by category
    PanelEditor.tsx          Seats (persona + model each), panel presets, custom persona entry
    ModelPicker.tsx          Keyboard-operable provider → model cascade
    ProtocolPicker.tsx       Engine cards in plain language + Advanced options
    EstimateBar.tsx          Pre-run estimate, Run / Run all three engines, the reason Run is disabled
    GettingStarted.tsx       Three-step explainer shown until the first run is saved
  run/
    RunView.tsx              Header, Compare engines, then Brief + Signals beside the Transcript (tabs below lg)
    RunHeader.tsx            Question, engine, panel, status line; Stop / Export / Re-run / New run
    Brief.tsx                Answer first: score + label, judge verdict, where they split, who moved
    WhoMoved.tsx             First → last confidence per participant, biggest shift first
    Signals.tsx              Confidence trajectory, confidence-spread flags, cost breakdown
    Transcript.tsx           Round navigation, participant cards, live streaming, per-participant filter
    RoundNav.tsx             Round segmented control with each round's score
    ResponseCard.tsx         Response / streaming / pending / error cards (anchored for jump-to)
    CompareEngines.tsx       Sweep comparison table; opens one engine's run
    BriefSection.tsx         Shared section frame and muted note for the brief
    navigation.ts            Shared transcript navigation (jump to a round or a response)
  history/
    HistoryView.tsx          Saved runs + two-run comparison
    RunList.tsx, RunRow.tsx  Search, engine filter, notes, export, delete, pick two to compare
    CompareRuns.tsx          Side-by-side table of two saved runs
    useHistory.ts            React binding over lib/history.ts + saveCompletedRun()
  Markdown.tsx               react-markdown with the settings for model output (safe links, no images)
  ConfidenceTrajectory.tsx   SVG chart of per-participant confidence across rounds
  DisagreementPanel.tsx      Confidence-spread flags grouped by round
  ClaimsPanel.tsx            Claim-level contradictions with verbatim quotes, click to jump to the response
  CostMeter.tsx              Token/USD totals by seat, judge and claim extraction
  JudgeCard.tsx              Judge synthesis: Majority / Minority / Unresolved
  PersonaBuilder.tsx         Axis-slider builder for custom personas (no free-text → no jailbreak surface)
  SessionMenu.tsx            Export menu: Markdown / JSON download, copy permalink
lib/
  consensus-engine.ts        CVP + Blind Jury + Adversarial Red Team orchestration, judge, claim extractor, cost cap
  providers.ts               Server-side provider resolution (parses AI_PROVIDERS)
  personas.ts                7 participant personas + JUDGE_PERSONA + axis-based custom-persona composer
  pricing.ts                 Model pricing table + cost estimator
  estimate.ts                Pre-run estimate: calls, rounds, USD range, minutes (assumptions documented inline)
  engine-rules.ts            Per-engine round rules (Red team ≥ 3, Blind jury = 1) shared by Setup, estimate, page
  export.ts                  Download a run as Markdown or JSON
  format.ts                  Cost, token, duration, date, delta and excerpt formatters
  history.ts                 Run history in localStorage (`rt.history.v1`, up to 50, quota-safe)
  limits.ts                  Input limits mirroring the route (question length, seats, cost cap)
  panel-presets.ts           Panel presets mapped onto the available models, cross-provider first
  run-blocker.ts             The reason a run cannot start yet, in plain words
  score-label.ts             Plain-language labels for scores, rounds and engines
  sweep.ts                   The engine sweep: its engines and the combined estimate
  prompt-library.ts          Example questions for the Setup view
  session.ts                 Snapshot ↔ Markdown / JSON / URL-hash serializer (incl. claim digests)
  store.ts                   Zustand global state: config, live run, sweep, current view, snapshot load/save
  types.ts                   All TypeScript types
```

The consensus engine runs entirely server-side. Each round streams responses via Server-Sent Events. The client processes events through a single `processEvent` function in `app/page.tsx` that calls Zustand actions directly via `getState()` rather than through a React subscription. Tokens are buffered and flushed into the store at most once per animation frame, so the Transcript re-renders at most once per frame while a response streams; finished response cards are memoised. Every view reads the same store, so a run keeps streaming while you look at Setup or History. The store records the options each run was started with, so exports, permalinks and history entries describe the run that actually happened even when Setup has changed since, and each sweep leg is labelled with its own engine. On `consensus-complete` the page saves the run to history and reports a failed save with a toast.

[`docs/DESIGN.md`](docs/DESIGN.md) describes the views, the store, persistence, the visual system and the estimate assumptions.

---

## Tech Stack

| Layer          | Technology                                              |
| -------------- | ------------------------------------------------------- |
| Framework      | Next.js 15 (App Router, React 19)                       |
| Language       | TypeScript (strict mode)                                |
| Styling        | Tailwind CSS on CSS-variable design tokens (light/dark) |
| State          | Zustand (granular selectors for performance)            |
| AI Integration | Vercel AI SDK (`@ai-sdk/openai` compatible adapters)    |
| Markdown       | react-markdown + remark-gfm                             |
| Icons          | lucide-react                                            |
| Toasts         | Sonner                                                  |

---

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/entropyvortex/roundtable)

Set your environment variables (`GROK_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_PROVIDERS`) in the Vercel dashboard. No database or external services required.

---

## Adding Personas

Edit `lib/personas.ts` and add a new entry to the `PERSONAS` array:

```typescript
{
  id: "philosopher",
  name: "Philosopher",
  emoji: "...",
  color: "#a78bfa",
  description: "Examines questions through ethical and epistemological frameworks",
  systemPrompt: `You are a Philosopher. Analyze through ethics, epistemology...`,
}
```

The new persona will appear in every selector automatically.

---

## Roadmap

RoundTable ships with three engines today. The architecture is designed to support more:

| Engine                                  | Status    | Description                                                                                    |
| --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| **CVP (Consensus Validation Protocol)** | Available | Multi-round structured debate with blind Round 1, randomized order, early stop, optional judge |
| **Blind Jury**                          | Available | Parallel independent responses with no cross-visibility, followed by a judge synthesis         |
| **Adversarial Red Team**                | Available | Rotating attacker stress-tests positions across stress rounds, post-stress synthesis last      |
| **Delphi Method**                       | Planned   | Anonymous multi-round forecasting with statistical aggregation between rounds                  |
| **Ranked Choice Synthesis**             | Planned   | Each model proposes solutions, then ranks all proposals — converges via elimination            |
| **Dialectical Engine**                  | Planned   | Thesis / Antithesis / Synthesis structure with formal argument mapping                         |

The consensus engine is a single file (`lib/consensus-engine.ts`) with a clean interface — contributions for new engines are welcome.

---

## Credits

RoundTable implements the **Consensus Validation Protocol** concept from [askgrokmcp](https://www.npmjs.com/package/askgrokmcp) — an MCP server that brings Grok's multi-model consensus capabilities to any AI assistant.

Built by [Marcelo Ceccon](https://github.com/marceloceccon).

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**If RoundTable is useful to you, consider giving it a star.**

It helps others discover it and motivates continued development.

</div>
