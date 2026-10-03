# Changelog

All notable changes to RoundTable are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Setup, Run and History views.** The single page is now three views behind a header switch. Setup holds the question, the panel, the protocol and a pre-run estimate; Run shows the brief beside the transcript; History lists saved runs.
- **Answer-first brief.** The Run view leads with the consensus score and a plain-language label (Strong agreement, Broad agreement with reservations, Split, Deep disagreement), then the judge's majority / minority / unresolved verdict, the claim-level contradictions ("Where they split", each side linking to its quote in the transcript) and "Who moved" (first → last confidence per participant). On wide screens the transcript sits beside the brief; on narrow ones Brief / Transcript / Signals are tabs. The transcript has round navigation with per-round scores, live streaming, a "Final positions" shortcut and a per-participant filter.
- **Run history.** Every completed run, including each engine of a sweep, is saved to `localStorage` (key `rt.history.v1`, newest 50, quota-safe) with a "Saved to history" toast; a failed save is reported too. The History view searches, filters by engine, takes notes, exports, deletes and reopens runs so they can be re-run.
- **Compare runs.** Two saved runs side by side: score, judge majority, contradictions, panel, cost and each participant's final confidence.
- **Compare engines.** The engine sweep ends in a table (score and label, contradictions, spread flags, judge majority, cost, tokens). Any row opens that engine's full run while the table stays. The run header reads "Engine 2 of 3 · Blind jury" while a sweep runs.
- **Pre-run estimate.** Calls, rounds, a USD range and minutes for the configured run and for the whole sweep, with the assumptions listed beside the figure (`lib/estimate.ts`). Run stays disabled, with the reason shown, until the setup is valid.
- **Panel presets** (Balanced, Red team, Investor lens) seated across the available providers (`lib/panel-presets.ts`).
- **Plain-language engine cards** and an Advanced disclosure that explains each option in one line.
- **Light and dark themes** from CSS design tokens. The system preference applies by default; the header toggle cycles system → light → dark, is persisted in `localStorage` and applied before first paint.
- A three-step "How it works" explainer on Setup until the first run is saved (replaces the auto-dismissing onboarding overlay).
- **Adversarial Red Team engine.** Third pluggable engine alongside CVP and Blind Jury. A rotating attacker stress-tests the other participants' positions across N-2 stress rounds, defenders respond in parallel, and a final post-stress round forces every participant to acknowledge which attacks landed. The attacker's persona is suspended for their turn (replaced with a neutral red-team framing) and their confidence score is excluded from the consensus formula because it measures attack success, not belief in a position. `pickAttackerIndex` rotates round-robin so attacker assignments are deterministic and reproducible.
- **Custom persona builder (axis sliders).** A new entry in the persona menu opens a session-scoped builder with six axes — Risk tolerance, Optimism, Evidence bar, Formality, Verbosity, Contrarian streak — each with three levels. The server composes the system prompt from a small library of vetted phrase fragments keyed by `(axis, level)`. The user-typed display name is sanitised against a Unicode-letter / digit / space / `._-'` allowlist and capped to 32 chars; user-typed prompt text never reaches the LLM. The spec is cached in `localStorage` for cross-session iteration.
- **Claim-Level Disagreement Extraction.** A post-final-round LLM pass that emits structured `{contradictions: [{claim, sides: [{stance, participantIds, quote}]}]}`. The parser drops fabricated quotes by verifying each quote's first 80 normalised characters against the actual response content of the named participants. Same-participant-on-multiple-sides is rejected. Cap of 8 contradictions per run; cap of 240 chars per claim, 600 chars per quote. The extractor reuses the judge model when judge synthesis is enabled, otherwise falls back to the first participant's model. Default ON. Renders in the brief's "Where they split" section with click-to-scroll-to-response per side.
- **Engine Sweep Mode.** "Run all three engines" runs the same prompt through CVP, Blind Jury, and Adversarial Red Team sequentially and ends in the Compare engines table. Sweep cancellation tears down the active run while preserving any engines that already completed.
- **Cost cap.** A new `costCapUSD` option (in the Protocol section's Advanced options) hard-aborts a run when the running estimated cost crosses the threshold. Server-clamped to ≤ $50. The engine throws `CostCapExceededError` which the SSE pipeline surfaces as an `error` event with the exact dollar figure.
- **Markdown export now includes the claim digest.** Each contradiction renders as a sub-section with stance, participants, and verbatim quote per side.
- **`SessionSnapshot.claims`** field on the snapshot type (optional for backwards compat with older permalinks). Loading a permalink rehydrates the claim digest into the brief.

### Changed

- Flat, token-based design: 1px borders, 8–12px radii, no blur, glow or decorative gradients, Inter, 14px body text, visible focus rings and keyboard-operable menus. Motion is opacity and transform only and off under `prefers-reduced-motion`.
- `ConfidenceTrajectory`, `JudgeCard`, `ClaimsPanel`, `DisagreementPanel` (now "Confidence-spread flags"), `CostMeter` (now split by seat, judge and claim extraction) and `SessionMenu` are restyled for the Run view.
- The Escape key and every Stop button stop the run from any view; switching views never interrupts a run. Opening a saved run or a sweep result while a run is in flight is refused with a toast instead of silently aborting it.
- The store records the options each run was started with, engine and rounds included. Exports, permalinks, the run header and history entries describe the run that actually happened, even when Setup changed while it streamed, and each sweep leg is labelled with its own engine. Opening a Compare engines row shows that engine's run under its own name and leaves the Setup options untouched.
- A non-OK `/api/consensus` response now shows the server's error message (e.g. the rate-limit text) instead of just the HTTP status.
- The Tailwind palette is semantic (`bg`, `surface`, `surface-2`, `border`, `fg`, `fg-muted`, `accent`, `success`, `warning`, `danger`, `info`); `vitest` coverage now also counts `components/**/*.ts`.
- README hero, Screenshot, Features, Quick Start, Protocol and Architecture sections rewritten for the three engines and the new UI. The Architecture section no longer claims token events cause no re-renders: tokens are flushed at most once per animation frame, so the Transcript re-renders per frame while streaming (finished response cards are memoised).
- `extractConfidence` now matches the LAST `CONFIDENCE: NN` occurrence in a response. Models that preview their score mid-response no longer short-circuit the canonical trailing line.
- `loadSnapshot` reconstructs `usageByParticipant` from `snapshot.rounds[*].responses[*].usage` instead of resetting to `{}`. Shared-view permalinks now show correct per-participant token totals in the cost breakdown.
- `cancelConsensus` now also clears `judgeStream`, `judgeRunning`, and `claimsRunning` so a mid-judge or mid-extraction cancel can't leave stale streaming text in the UI.
- `extractUsage` no longer chains `as unknown as` casts. All field reads go through `typeof` guards, with malformed values falling cleanly through to the heuristic estimator.

### Removed

- `HeroArt`, `ResultPanel`, `MessageFlowDiagram`, `SweepResultsPanel`, `BackToTop`, `AISelector`, `ConfigPanel` and `PromptLibrary` components (replaced by the Setup / Run / History views), `public/background.jpg`, the starfield / orb / glass CSS, the legacy `arena-*` Tailwind colours and glow shadows, and the onboarding overlay.

### Fixed

- Engine sweep results were labelled with the configured engine: the swept engine was sent to the server as a per-request override but never recorded, so every sweep snapshot, its export and its permalink claimed to be the same engine.
- The sweep ignored Red team's three-round minimum when Debate was set to one or two rounds. Shared round rules (`lib/engine-rules.ts`) now raise the count in the request, the estimate, the run header and the Setup stepper.
- A run whose stream closed without `consensus-complete` or `error` stayed "running" forever; it now fails with a toast. An `error` event mid-sweep stops the sweep instead of recording the failed engine as a result.
- Pressing Escape after a finished sweep no longer reports "Sweep cancelled".
- The module-level `setInterval` rate-limit cleanup in `app/api/consensus/route.ts` is keyed on a global symbol so Next.js HMR can no longer accumulate intervals across reloads. Vercel cold starts are unaffected.
- A test using `mockImplementation` instead of `mockImplementationOnce` was leaking a broken streamText stub into every later test in the engine suite, which would have masked confidence-extraction bugs in adversarial / claim-extraction code. Switched to scoped `mockImplementationOnce` chains.

### Tests

- The page and component suites written against the old UI (`page`, `page-consensus`, `components`, `components-extended`, `new-components`, `ai-selector-extended`) are replaced by `page-shell`, `page-run` and `page-sweep`, which drive the app against a controllable fake SSE server (`tests/helpers/page-harness.ts`). They cover providers loading and failing, a streamed run landing in the brief and transcript, participant and run errors, HTTP errors, an early stream end, Stop and Escape, streaming in the background across views, the three-engine sweep with per-engine labels and the Compare engines table, cancel and failure mid-sweep, read-only permalinks, history auto-save, reopening and re-running saved runs, New run, and export.
- New suites for every Setup, Run, History and UI component and for `estimate`, `history`, `engine-rules`, `panel-presets` and `score-label`.
- New coverage: adversarial engine prompts and rotation, attacker-excluded scoring, parallel defenders, custom persona sanitiser and composer (including injection-shape names), claim-extractor parser (well-formed / noise / fabricated-quote / same-participant rejection), `pickClaimExtractorModelId`, engine integration end-to-end with claims, soft-fail behaviour, sweep state actions and cancellation, cost-cap enforcement and disabled defaults, `extractConfidence` last-occurrence anchoring, `loadSnapshot` usage reconstruction, API route accepting / rejecting custom persona specs, accepting the adversarial engine.

### Documentation

- Added [`docs/DESIGN.md`](docs/DESIGN.md): the views, state, persistence, visual system and estimate assumptions behind the UI.
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
