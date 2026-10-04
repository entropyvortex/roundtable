# UI design notes

The interface follows one rule: the brief is the product and the transcript is the evidence. A user writes a question, picks a panel, sees what the run will cost, runs it, and reads an answer-first summary with the full transcript one click away. Every completed run is saved so it can be reopened and compared.

## Views

A single page with three views, selected by `view` in the store (`lib/store.ts`) and by the tabs in `components/AppShell.tsx`.

- **Setup** (`components/setup/`): the question, the panel (one persona and one model per seat, presets, a custom persona builder), the protocol (three engine cards and an Advanced disclosure) and a sticky estimate bar with Run and Run all three engines. `getRunBlocker` names the reason a run cannot start. `lib/engine-rules.ts` keeps the round rules identical in the stepper, the estimate and the request.
- **Run** (`components/run/`): a header (question, engine, panel, status, Stop / Export / Re-run / New run), the Compare engines table after a sweep, then the brief (score and label, judge verdict, where they split, who moved) beside the transcript (round navigation, one card per participant, live streaming, participant filter). Below the `lg` breakpoint the brief, the transcript and the signals become tabs. Each pane renders once so response anchors stay unique.
- **History** (`components/history/`): saved runs with search, an engine filter, notes, export, delete, reopen, and a two-run comparison.

`app/page.tsx` owns the side effects: fetching providers, streaming `/api/consensus` into the store, the sweep loop, Stop and Escape, `#rt=` permalinks (which open the Run view read-only) and saving completed runs to history. Switching views never touches a run in flight.

## State

The store keeps the Setup configuration (`options`) apart from the run it shows. `startConsensus(engine?)` records the options actually sent as `runOptions` (with the engine and the rounds that engine runs), `loadSnapshot` records the snapshot's options, and `getSnapshot()` reads `runOptions`. Exports, permalinks, the run header and history entries therefore describe the run that happened, even when Setup changed while it streamed or a sweep sent a different engine. `loadSnapshot(snapshot, { sharedView, keepOptions })` opens a run read-only (permalinks), editable (History) or without touching Setup (a Compare engines row). `runStartedAt` and `runEndedAt` give the duration shown in the header.

## Persistence

- **History**: `localStorage["rt.history.v1"]` holds a JSON array of entries (id, title, note, savedAt, engine, score, cost, snapshot), newest first, at most 50. Every access is wrapped in try/catch; when storage is full the oldest entries are dropped until the new run fits (`lib/history.ts`). An entry's id is a hash of the run's engine, question and response timestamps, so saving the same run twice replaces it (`components/history/useHistory.ts`).
- **Theme**: `localStorage["rt.theme"]` is `light` or `dark`; absent means follow the system. An inline script in `app/layout.tsx` applies it before first paint and `components/ui/theme.ts` keeps open tabs in sync.
- **Custom persona**: the builder caches its last spec under `roundtable.customPersonaSpec.v1` (`components/PersonaBuilder.tsx`).

## Visual system

- Colours are RGB triplets on `:root` (light), `:root[data-theme="dark"]` and a `prefers-color-scheme: dark` block guarded by `:root:not([data-theme="light"])` in `app/globals.css`. Tailwind exposes them as `bg`, `surface`, `surface-2`, `border`, `fg`, `fg-muted`, `accent`, `success`, `warning`, `danger` and `info`, with alpha support. The contrast ratios each pair was checked against are listed at the top of `globals.css`.
- Flat surfaces, 1px borders, 8–12px radii, shadows only on popovers. The orange accent is darkened in the light theme to keep AA contrast.
- Inter through `next/font`; 14px body text, 13px secondary, 12px only for chips; tabular numerals for scores and costs.
- Motion is opacity and transform only, at most 200ms, and off under `prefers-reduced-motion`.
- `components/ui/` holds the primitives (Button, Card, Field, Toggle, Tabs, Segmented, Menu, Popover, Badge, Tooltip, Skeleton, EmptyState, ThemeToggle, Logo). Views do not hand-roll controls. Menus and tabs are keyboard-operable and carry the matching ARIA roles.

## Estimate

`lib/estimate.ts` mirrors each engine's call pattern (parallel blind first round, sequential debate rounds, attacker then defenders in Red team, the judge and claim-extraction passes) and prices it with `lib/pricing.ts`. The assumptions (tokens per answer, system prompt size, seconds per call) are constants at the top of the file and are shown in the estimate's tooltip.

## Tests

Unit tests cover every lib module and component. Page-level tests drive the whole app against a fake SSE server (`tests/helpers/page-harness.ts`): providers, a streamed run, participant and run errors, Stop and Escape, the sweep, permalinks, history and export.
