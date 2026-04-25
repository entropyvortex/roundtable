# Changelog

All notable changes to RoundTable are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Adversarial Red Team engine.** Third pluggable engine alongside CVP and Blind Jury. A rotating attacker stress-tests the other participants' positions across N-2 stress rounds, defenders respond in parallel, and a final post-stress round forces every participant to acknowledge which attacks landed. The attacker's persona is suspended for their turn (replaced with a neutral red-team framing) and their confidence score is excluded from the consensus formula because it measures attack success, not belief in a position. `pickAttackerIndex` rotates round-robin so attacker assignments are deterministic and reproducible.
- **Custom persona builder (axis sliders).** A new entry in the persona menu opens a session-scoped builder with six axes — Risk tolerance, Optimism, Evidence bar, Formality, Verbosity, Contrarian streak — each with three levels. The server composes the system prompt from a small library of vetted phrase fragments keyed by `(axis, level)`. The user-typed display name is sanitised against a Unicode-letter / digit / space / `._-'` allowlist and capped to 32 chars; user-typed prompt text never reaches the LLM. The spec is cached in `localStorage` for cross-session iteration.
- **Claim-Level Disagreement Extraction.** A post-final-round LLM pass that emits structured `{contradictions: [{claim, sides: [{stance, participantIds, quote}]}]}`. The parser drops fabricated quotes by verifying each quote's first 80 normalised characters against the actual response content of the named participants. Same-participant-on-multiple-sides is rejected. Cap of 8 contradictions per run; cap of 240 chars per claim, 600 chars per quote. The extractor reuses the judge model when judge synthesis is enabled, otherwise falls back to the first participant's model. Default ON. Renders in a new `ClaimsPanel` with click-to-scroll-to-response per side.
- **Engine Sweep Mode.** A new "Sweep" button next to "Run Consensus" runs the same prompt through CVP, Blind Jury, and Adversarial Red Team sequentially. The live ResultPanel shows the current engine; a `SweepResultsPanel` below renders one card per engine with the final score, judge majority excerpt, top contradictions, disagreement count, and per-engine token / USD subtotal. Sweep cancellation tears down the active run while preserving any engines that already completed.
- **Cost cap.** A new `costCapUSD` option (also exposed in the Protocol panel UI) hard-aborts a run when the running estimated cost crosses the threshold. Server-clamped to ≤ $50. The engine throws `CostCapExceededError` which the SSE pipeline surfaces as an `error` event with the exact dollar figure.
- **Markdown export now includes the claim digest.** Each contradiction renders as a sub-section with stance, participants, and verbatim quote per side.
- **`SessionSnapshot.claims`** field on the snapshot type (optional for backwards compat with older permalinks). Loading a permalink rehydrates the claim digest into the Claims panel.

### Changed

- README hero blurb, Features table, Protocol section, Architecture file map, and Roadmap status all updated to reflect three available engines and the new affordances.
- `extractConfidence` now matches the LAST `CONFIDENCE: NN` occurrence in a response. Models that preview their score mid-response no longer short-circuit the canonical trailing line.
- `loadSnapshot` reconstructs `usageByParticipant` from `snapshot.rounds[*].responses[*].usage` instead of resetting to `{}`. Shared-view permalinks now show correct per-participant token totals in the floating cost meter.
- `cancelConsensus` now also clears `judgeStream`, `judgeRunning`, and `claimsRunning` so a mid-judge or mid-extraction cancel can't leave stale streaming text in the UI.
- `extractUsage` no longer chains `as unknown as` casts. All field reads go through `typeof` guards, with malformed values falling cleanly through to the heuristic estimator.

### Fixed

- The module-level `setInterval` rate-limit cleanup in `app/api/consensus/route.ts` is keyed on a global symbol so Next.js HMR can no longer accumulate intervals across reloads. Vercel cold starts are unaffected.
- A test using `mockImplementation` instead of `mockImplementationOnce` was leaking a broken streamText stub into every later test in the engine suite, which would have masked confidence-extraction bugs in adversarial / claim-extraction code. Switched to scoped `mockImplementationOnce` chains.

### Tests

- Test count: 207 → 255 (+48 across the four features and the QA bundle).
- New coverage: adversarial engine prompts and rotation, attacker-excluded scoring, parallel defenders, custom persona sanitiser and composer (including injection-shape names), claim-extractor parser (well-formed / noise / fabricated-quote / same-participant rejection), `pickClaimExtractorModelId`, engine integration end-to-end with claims, soft-fail behaviour, sweep state actions and cancellation, cost-cap enforcement and disabled defaults, `extractConfidence` last-occurrence anchoring, `loadSnapshot` usage reconstruction, API route accepting / rejecting custom persona specs, accepting the adversarial engine.

### Documentation

- Added [`newfeatures.md`](newfeatures.md) tracking the rationale for each feature, the Grok-consensus QA notes, and the code-quality bundle.
- Added [`CHANGELOG.md`](CHANGELOG.md) (this file).
- Added [`SECURITY.md`](SECURITY.md) covering the threat model and security principles.

---

## [1.0.0] — 2026-04-15

Initial public release plus the demo-uplift features.

### Added

- **Blind Jury engine** alongside CVP — single-pass parallel responses + judge synthesis.
- **Judge synthesizer** — optional non-voting model produces structured Majority / Minority / Unresolved / Confidence sections over the final round.
- **Confidence trajectory chart** — live SVG sparkline with one line per participant.
- **Disagreement ledger** — confidence-spread heuristic flags pairs whose self-reported confidence diverges by ≥ 20 points.
- **Cost meter** with bundled pricing table for major frontier models.
- **Floating run panel** stacking cost meter + trajectory + ledger + UML message-flow diagram on xl+ screens.
- **Provider error handling** — errored participant calls render as red error cards and are excluded from the consensus score.
- **Prompt library** — 8 curated preset prompts as chips under the textarea.
- **Session export & share** — Markdown / JSON download plus URL-hash permalink (compressed via `CompressionStream` when available).
- **Shared view mode** — `#rt=…` permalinks rehydrate into a read-only viewer.
- **Real-time SSE streaming, cancel anytime, rate limiting, server-side input validation, persona/model re-verification.**
- **CVP Consensus Validation Protocol** — multi-round structured debate with blind Round 1, randomised order, and early stopping.
- **7 built-in personas** — Risk Analyst, First-Principles Engineer, VC Specialist, Scientific Skeptic, Optimistic Futurist, Devil's Advocate, Domain Expert.
- **Multi-provider OpenAI-compatible client** — Grok, Claude, OpenAI, Mistral, Groq, Together, etc.

[Unreleased]: https://github.com/entropyvortex/roundtable/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/entropyvortex/roundtable/releases/tag/v1.0.0
