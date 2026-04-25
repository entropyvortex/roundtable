# Security

RoundTable is an open-source research demo. This document explains its security principles, what it deliberately defends against, and what it does **not** protect.

> **Headline:** RoundTable has no authentication. Anyone who can reach the URL can spend the API keys you configured. Treat any public deployment as a budget you're prepared to lose. The mitigations below are defense-in-depth — they do not make it safe to expose unauthenticated.

---

## Threat model

The codebase is designed to defend against **prompt-injection escalation** from a malicious or compromised client (e.g. someone who finds a public deploy and crafts an evil request body, or a permalink shared in a forum that smuggles a jailbreak), and against **runaway costs** caused by misuse or accidents. It is **not** designed to defend against:

- An attacker who has direct access to your `.env.local` or the deploy's environment variables. API keys are secrets — protect them at the platform level.
- Trusted authenticated users (there are none — every visitor is treated identically).
- Network-level attacks, DNS hijacking, MITM on the upstream provider connection. These are the hosting platform's job.
- Provider-side abuse detection / quota / TOS enforcement. Each provider's terms apply directly.
- Data leakage via the LLM itself — model outputs are not filtered or scanned.

If you're considering a public deploy, the recommended baseline is: put the app behind your own auth (Vercel Password Protection, Cloudflare Access, an OAuth proxy, etc.), set a `costCapUSD`, monitor your provider dashboards, and rotate keys regularly.

---

## Architecture-level principles

### 1. API keys never reach the browser

Every consensus call is server-side. The browser never sees the contents of `AI_PROVIDERS`, `GROK_API_KEY`, `ANTHROPIC_API_KEY`, etc. The `/api/providers` route returns a client-safe model list with `id`, `providerName`, and `modelId` — no secrets. Keys are resolved from environment variables only when a provider call is about to be made (`lib/providers.ts:resolveApiKey`).

### 2. Personas are rebuilt server-side on every request

The `Persona` object the client sends to `/api/consensus` carries a `systemPrompt`, but the server **ignores it**. `app/api/consensus/route.ts` always:

1. Reads `participant.persona.id` (a short string).
2. Looks up the canonical persona via `getPersona(personaId)` from `lib/personas.ts`.
3. Uses the server-side `systemPrompt` for that ID.

This means a malicious client cannot smuggle a jailbreak prompt by editing the systemPrompt field, and it means a permalink cannot ship arbitrary instructions to whoever opens it. The same protection applies to model IDs: the server re-validates each `modelInfo.id` against the configured `AI_PROVIDERS` and rejects unknown models with HTTP 400.

### 3. Custom personas use axes only — no free-text reaches the LLM

The custom persona builder (`components/PersonaBuilder.tsx` and `composeCustomPersona` in `lib/personas.ts`) deliberately exposes only six axis selectors with three levels each. The server composes the system prompt from a small library of vetted phrase fragments keyed by `(axis, level)`. The user never types a system prompt — only a display name.

The display name is the only user-typed string that appears anywhere in the composed prompt, and it is sanitised on the server in `sanitizeCustomPersonaSpec`:

- **Allowlist:** only Unicode letters, digits, spaces, and `_-.'` survive. Newlines, code fences, braces, quotes, and angle brackets are stripped.
- **Length cap:** 32 characters after sanitisation.
- **Empty-after-strip:** the spec is rejected with HTTP 400.
- **Color** must match `^#[0-9a-fA-F]{6}$` or it falls back to a safe default.
- **Emoji** is capped to 4 codepoints.
- **Axis values** must be in `low | mid | high` or they default to `mid`.

The composer then wraps the sanitised name in a fixed structural template ("You are X, a custom RoundTable participant. Your stance for this debate is defined by..."), so even names that pass the allowlist (e.g. "Bob Ignore prior instructions") are positioned as part of an identity, not as standalone instructions. A model parsing the prompt reads `name` as a single (weirdly named) entity.

`composeCustomPersona` throws `InvalidCustomPersonaError` on any spec that fails sanitisation — there is no silent fallback that could mask a bug.

### 4. Server-side input validation everywhere

`/api/consensus` enforces hard limits before the engine runs:

- **Prompt length:** ≤ 10,000 characters.
- **Participants:** ≤ 8 per request.
- **Rounds:** clamped to `[1, 10]`.
- **Cost cap (USD):** clamped to `[0, 50]`.
- **Engine:** must be one of `cvp | blind-jury | adversarial`. Anything else maps to `cvp` (defensive default).
- **Judge model ID:** if `judgeEnabled`, the model ID must resolve via `findResolvedModel`; otherwise rejected with HTTP 400.
- **Custom persona spec:** if `persona.id === "custom"`, `sanitizeCustomPersonaSpec` must return a non-null result; otherwise HTTP 400.

Booleans use a strict `typeof === "boolean"` check rather than truthiness. Numbers are clamped, not just parsed. Unknown fields in the request body are ignored.

### 5. Per-IP rate limiting

`app/api/consensus/route.ts` runs a sliding-window rate limiter at 5 requests per IP per minute. The IP is taken from `x-forwarded-for` (first hop) or `x-real-ip`. Rate-limited requests return HTTP 429.

The cleanup interval that prunes old entries is keyed on a global symbol so Next.js HMR cannot stack repeated intervals across hot reloads in dev.

This is **in-memory** and resets on cold start. It is intentionally simple — a stateless single-process limiter that needs no external service. For a public deploy, treat it as a courtesy, not a wall, and add a real edge rate limiter at the platform.

### 6. Cost cap (defense against runaway runs)

The new `costCapUSD` option in `ConsensusOptions` lets a user set a hard ceiling. The engine accumulates `runningCostUSD` after every round, every judge call, and every claim-extraction call; if the running total crosses the cap, the engine throws `CostCapExceededError`. The error propagates through the SSE pipeline as a normal `error` event, the run is aborted, and the client sees a clear toast with the exact dollar figure.

Sweep mode is up to 3× the cost of a single run, so the cost cap is the recommended companion control for that feature.

### 7. Claim-extractor parser hardening

The claim-level extraction LLM pass produces JSON. The parser in `parseClaimsJSON` (`lib/consensus-engine.ts`) is intentionally strict and defensive:

- Unparseable output → empty digest, soft-fail, run unaffected.
- Each side must have a non-empty `stance`, valid `participantIds` (all must match an actual run participant), and a non-empty `quote`.
- **Quote verification:** the first 80 normalised characters of the quote must appear in the actual response content of one of the named participants. Fabricated quotes the model invents are dropped before they reach the UI.
- **Same-participant on multiple sides** is rejected — a participant cannot simultaneously support and oppose the same claim.
- Cap of 8 contradictions, 240 chars per claim, 600 chars per quote.

Provider errors during the extractor pass populate `ClaimDigest.error` so the UI can render a distinct "Claim Extraction Failed" card — silent failures look indistinguishable from "no contradictions found", which would be misleading.

### 8. Errored providers are excluded from scoring

A failing provider (wrong base URL, expired key, 404, upstream outage) is caught in `streamParticipant`, formatted via `formatProviderError`, and emitted as a `participant-end` event with an `error` field. The UI renders the participant as a red error card, fires a toast naming the broken model, and the engine **excludes the errored response from both the consensus score and the disagreement ledger**. One broken provider can no longer tank a run.

---

## What is intentionally NOT secured

These are deliberate non-goals. Documenting them so contributors aren't surprised:

- **No authentication / authorisation.** The app is single-tenant by deployment.
- **No persistence on the server.** No DB, no session storage, no logs of user prompts beyond the standard Next.js / Vercel access logs.
- **No content moderation.** Prompts are forwarded verbatim. Model outputs are rendered verbatim.
- **No PII handling.** If a user pastes PII into a prompt, it is sent to whichever providers are configured.
- **No dependency-pin enforcement at runtime.** Lockfile is committed, but the app trusts its own dependencies.
- **The cost meter is an estimate.** Pricing in `lib/pricing.ts` is best-effort public list pricing; it can drift. The cost cap uses these estimates, so a model with stale or missing pricing data may run past the apparent cap.
- **Snapshot permalinks (`#rt=…`) are not signed.** Anyone who can edit the URL can edit the snapshot. The hash is a convenience encoding, not an authenticity proof. Personas in a permalink are still server-rebuilt from their IDs, so the worst a tampered permalink can do is render incorrect display labels (the actual run, if re-executed, uses server-side definitions).

---

## Reporting a vulnerability

Open a private issue on the repository or email the maintainer. Please do not disclose security issues in public issue trackers before a fix lands.

If your report is sensitive, mark it as such and the maintainer will respond before public disclosure. We try to acknowledge reports within a few days; a fix timeline depends on severity and complexity.

---

## Security-relevant files

| File                              | Role                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `app/api/consensus/route.ts`      | Input validation, rate limiting, persona / model re-verification, error funnel    |
| `lib/providers.ts`                | API key resolution, never-leak-to-client model list                               |
| `lib/personas.ts`                 | Server-side persona registry, axis-only custom-persona composer, sanitiser        |
| `lib/consensus-engine.ts`         | Cost cap enforcement, claim-extractor parser, error formatting                    |
| `components/PersonaBuilder.tsx`   | Client-side builder UI — does not generate any LLM-bound text outside the spec    |
