<div align="center">

> **AI Experiment / Showcase** — This project is built for educational and research purposes. It demonstrates how multiple AI models can be orchestrated into structured consensus processes. Not intended for production decision-making.

# RoundTable

### Multi-AI Consensus Playground

**Put multiple AI models in a room. Give them personas. Watch them debate.**

RoundTable runs the Consensus Validation Protocol (CVP) across any combination of AI providers — Grok, Claude, GPT, Gemini, Mistral, and more — with configurable personas, real-time streaming, and a premium dark interface designed for long sessions.

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

## Consensus Validation Protocol

### Purpose

A single language model produces a single distribution over tokens. It has no mechanism to check its own reasoning against an independent perspective. The Consensus Validation Protocol (CVP) addresses this by running multiple models — each constrained to a distinct analytical persona — through a structured sequence of rounds where they must respond to each other's arguments. The goal is not to produce a "correct" answer by majority vote, but to surface disagreements, stress-test reasoning, and force each participant to update its position in light of criticism.

The result is a scored collection of final perspectives, not a merged conclusion. The human reader is the ultimate synthesizer.

### How It Works

CVP runs a fixed number of rounds (1–10, user-configured, default 5). Each round has a designated type that constrains what participants are asked to do. Participants are processed **sequentially within each round** — meaning later participants in a round see earlier participants' responses from that same round, in addition to all responses from prior rounds.

**Round phases:**

1. **Initial Analysis** (Round 1) — Each participant provides an independent analysis of the prompt, shaped by its assigned persona. No cross-visibility exists yet. Each response must end with a self-assessed confidence score (0–100).

2. **Counterarguments** (Round 2) — Each participant reviews all Round 1 responses and identifies weaknesses, challenges assumptions, and highlights logical gaps. Confidence scores are updated.

3. **Evidence Assessment** (Round 3) — Participants evaluate the strength of evidence presented so far, distinguish well-supported claims from speculation, and identify areas of emerging agreement.

4. **Synthesis** (Rounds 4 through N) — Participants synthesize the discussion, acknowledge remaining uncertainties, and refine their positions. The final round is labeled "Final Synthesis" in the prompt, signaling participants to commit to a concluding position.

**Persona injection:** Each participant's system prompt is prepended with a persona definition (e.g., "You are a Risk Analyst. Your role is to surface hidden dangers, tail risks, and second-order effects."). Personas are defined server-side in `lib/personas.ts` and cannot be modified by the client.

**Confidence extraction:** Every response is expected to end with `CONFIDENCE: [0-100]`. A regex extracts this value. If absent, confidence defaults to 50.

**Consensus scoring:** After each round, a consensus score is computed:

```
consensus_score = avg(confidence) - 0.5 * stddev(confidence)
```

High average confidence with low variance yields a high score. Disagreement (high variance) penalizes the score even if individual confidences are high.

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

**Sycophantic convergence.** Models tend to agree with prior responses, especially in later rounds. The sequential execution order means the last participant in each round sees the most prior context and may anchor to the emerging consensus rather than independently evaluating. This is the opposite of the intended effect.

**No early stopping.** CVP always runs all N rounds. If participants converge in Round 2, Rounds 3–5 add latency and cost without new information. There is no convergence detection or early termination.

**Persona dominance via ordering.** The first participant in each round sets the tone. Later participants respond to what exists rather than generating independently. The protocol does not randomize participant order between rounds.

**Cost scales linearly.** Each participant makes one API call per round. With 4 participants and 5 rounds, that is 20 API calls per consensus run. At 1,500 tokens per response, a single run can consume 30,000+ output tokens across providers.

**Confidence scores are self-reported.** Models assign their own confidence. There is no calibration, no ground truth, and no penalty for overconfidence. The consensus score is only as meaningful as the models' ability to self-assess — which is known to be unreliable.

### Example Transcript

This is a simplified reconstruction of how a 3-participant, 3-round run behaves based on the actual code path. The prompt is: *"Should a startup use microservices from day one?"*

**Round 1 — Initial Analysis:**

> **Risk Analyst (Grok):** Microservices introduce distributed systems complexity — network partitions, eventual consistency, deployment orchestration — before the team has validated product-market fit. Premature optimization of architecture is a top-5 startup killer. CONFIDENCE: 85

> **Optimistic Futurist (Claude):** Starting with microservices positions the team for scale from day one. The tooling has matured — Kubernetes, service meshes, and managed cloud services reduce the operational burden significantly. CONFIDENCE: 75

> **First-Principles Engineer (GPT-4o):** The question conflates architecture with deployment strategy. A modular monolith can be decomposed later. The real constraint is team size — a 3-person team cannot operate 8 services. CONFIDENCE: 90

*Consensus score: 80 (avg=83.3, stddev=6.2)*

**Round 2 — Counterarguments:**

> **Risk Analyst:** The Optimistic Futurist overstates tooling maturity. Kubernetes is not "reduced complexity" — it's traded complexity. Agree with First-Principles on the team-size constraint. Revising slightly upward. CONFIDENCE: 88

> **Optimistic Futurist:** The First-Principles argument about modular monoliths is valid. However, decomposing a monolith later is not free — the argument assumes clean module boundaries that rarely exist in practice. Lowering confidence. CONFIDENCE: 65

> **First-Principles Engineer:** Risk Analyst's point about premature optimization aligns with my position. The Futurist raises a fair concern about decomposition cost, but this is solvable with discipline. Maintaining position. CONFIDENCE: 88

*Consensus score: 77 (avg=80.3, stddev=10.7 — variance increased due to Futurist's drop)*

**Round 3 — Evidence Assessment / Final Synthesis:**

> **Risk Analyst:** The evidence pattern across rounds: 2/3 participants favor monolith-first. The Futurist's tooling argument was partially conceded. Remaining disagreement is about decomposition cost — a real but secondary concern. CONFIDENCE: 90

> **Optimistic Futurist:** I concede the monolith-first approach is lower-risk for most startups. My position narrows to: startups with **known scale requirements** (e.g., real-time data pipelines) may justify early microservices. CONFIDENCE: 70

> **First-Principles Engineer:** Consensus is forming around monolith-first with clean boundaries. The Futurist's exception for known-scale cases is reasonable and worth noting. CONFIDENCE: 92

*Final consensus score: 81 (avg=84, stddev=9.8)*

The human reader sees three final positions that largely converge but preserve the Futurist's conditional exception — something a majority vote would have discarded.

### Missing Pieces

The following are not implemented in the current codebase but would make the protocol substantially more rigorous:

1. **Convergence detection and early stopping.** Compare confidence distributions between consecutive rounds. If the delta drops below a threshold, terminate early. This would save cost and avoid the sycophantic convergence problem in later rounds.

2. **Randomized participant ordering.** Shuffle the participant sequence each round to prevent first-mover anchoring bias. The current fixed order means the first participant disproportionately frames each round.

3. **Explicit disagreement tracking.** Parse responses for areas of agreement and disagreement, maintain a structured disagreement ledger across rounds, and surface unresolved disputes in the final output rather than relying on the human to find them.

4. **Confidence calibration or external validation.** Self-reported confidence is unreliable. A calibration step — comparing stated confidence to accuracy on known-answer questions — or a separate judge model that evaluates argument quality would add grounding.

5. **Automated final synthesis.** A dedicated synthesis step where a separate model (or a designated participant) produces a single merged conclusion from all final-round responses, explicitly noting majority and minority positions. Currently, the human must do this manually.

## Security

This is experimental, it has no authentication protection, if you publish this with your keys, someone could burn your tokens/exploit to process their prompts out of curiosity or malice.

---

## Screenshots

![Screenshot of Web Interface](screenshots/screenshot1.png)

![Screenshot Consensus panel](screenshots/screenshot2.png)

## Features

| Feature                           | Description                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-Provider**                | Connect any OpenAI-compatible API — Grok, Claude, OpenAI, Mistral, Groq, Together, and more                                      |
| **7 Built-in Personas**           | Risk Analyst, First-Principles Engineer, VC Specialist, Scientific Skeptic, Optimistic Futurist, Devil's Advocate, Domain Expert |
| **Consensus Validation Protocol** | Structured multi-round debate: Analysis, Counterarguments, Evidence Assessment, Synthesis                                        |
| **1-10 Configurable Rounds**      | Control the depth of deliberation                                                                                                |
| **Real-time SSE Streaming**       | Watch responses arrive token-by-token with live progress tracking                                                                |
| **Cascaded Model Selector**       | Provider-first dropdown with persona assignment per participant                                                                  |
| **Message Flow Sidebar**          | UML-style sequence diagram of the entire debate, click to navigate                                                               |
| **Copy to Clipboard**             | One-click raw markdown export per response                                                                                       |
| **Cancel Anytime**                | Stop button + Escape key — abort signal propagates to the server and stops provider calls                                        |
| **Premium Dark UI**               | High-contrast, readable interface designed for extended analysis sessions                                                        |
| **Rate-Limited API**              | In-memory per-IP rate limiting, server-side input validation, persona/model re-verification                                      |
| **No External Services**          | No database, no auth service, no persistence — Vercel-deployable in one click                                                    |

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

Open [http://localhost:3000](http://localhost:3000). Add participants from the sidebar, type a prompt, and hit **Run Consensus**.

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
    consensus/route.ts    SSE streaming endpoint — runs the CVP engine
    providers/route.ts    Returns client-safe model list (no secrets)
  page.tsx                Main dashboard — sidebar, prompt, results
  layout.tsx              Root layout with Sonner toasts
components/
  AISelector.tsx          Cascaded provider/model picker + persona selector
  ResultPanel.tsx         Live streaming results with markdown rendering
  MessageFlowDiagram.tsx  Floating UML-style sequence diagram
  BackToTop.tsx           Scroll navigation
lib/
  consensus-engine.ts     Multi-round CVP orchestration with SSE
  providers.ts            Server-side provider resolution (parses AI_PROVIDERS)
  personas.ts             7 persona definitions — edit this one file to add more
  store.ts                Zustand global state with granular selectors
  types.ts                All TypeScript types
```

The consensus engine runs entirely server-side. Each round streams responses via Server-Sent Events. The client processes events through a single `processEvent` function that calls Zustand actions directly via `getState()` — no subscriptions, no re-renders from token events.

---

## Tech Stack

| Layer          | Technology                                           |
| -------------- | ---------------------------------------------------- |
| Framework      | Next.js 15 (App Router, React 19)                    |
| Language       | TypeScript (strict mode)                             |
| Styling        | Tailwind CSS                                         |
| State          | Zustand (granular selectors for performance)         |
| AI Integration | Vercel AI SDK (`@ai-sdk/openai` compatible adapters) |
| Markdown       | react-markdown + remark-gfm                          |
| Icons          | lucide-react                                         |
| Toasts         | Sonner                                               |

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

RoundTable currently ships with the **Consensus Validation Protocol (CVP)** engine. The architecture is designed to support multiple consensus strategies — future releases will introduce additional engines:

| Engine                                  | Status    | Description                                                                                          |
| --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| **CVP (Consensus Validation Protocol)** | Available | Multi-round structured debate: Analysis, Counterarguments, Evidence Assessment, Synthesis            |
| **Delphi Method**                       | Planned   | Anonymous multi-round forecasting with statistical aggregation between rounds                        |
| **Adversarial Red Team**                | Planned   | One model attacks, others defend — iterative stress-testing of ideas                                 |
| **Ranked Choice Synthesis**             | Planned   | Each model proposes solutions, then ranks all proposals — converges via elimination                  |
| **Dialectical Engine**                  | Planned   | Thesis / Antithesis / Synthesis structure with formal argument mapping                               |
| **Blind Jury**                          | Planned   | Models respond independently with no visibility into each other's answers, then a synthesizer merges |

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
