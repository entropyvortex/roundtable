"use client";

// ─────────────────────────────────────────────────────────────
// RoundTable — main page: AppShell + Setup / Run / History
// ─────────────────────────────────────────────────────────────
// The views read and write the store; this page owns the side effects:
// loading providers, streaming /api/consensus (SSE → processEvent),
// the three-engine sweep, Stop / Esc, `#rt=` permalinks, and saving
// every completed run to history.
//
// Switching views never touches a live run: it keeps streaming into
// the store and the Run tab picks it up again.

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SetupView from "@/components/setup/SetupView";
import RunView from "@/components/run/RunView";
import HistoryView from "@/components/history/HistoryView";
import { saveCompletedRun, useHistory, type HistoryEntry } from "@/components/history/useHistory";
import { optionsForEngine } from "@/lib/engine-rules";
import { getRunBlocker } from "@/lib/run-blocker";
import { engineLabel } from "@/lib/score-label";
import { SWEEP_ENGINES } from "@/lib/sweep";
import { decodeSnapshotFromHash } from "@/lib/session";
import { useArenaStore } from "@/lib/store";
import type {
  ConsensusEvent,
  ConsensusRequest,
  EngineType,
  ModelInfo,
  SessionSnapshot,
} from "@/lib/types";

export default function HomePage() {
  const view = useArenaStore((s) => s.view);
  const { runs } = useHistory();
  const historyCount = runs.length;

  // True from the start of a sweep until its loop exits — including the
  // short gaps between engines when no single run is in flight.
  const sweepLoop = useRef(false);

  // ── Providers ──────────────────────────────────────────────
  useEffect(() => {
    const { setAvailableModels, setModelsLoading } = useArenaStore.getState();
    fetch("/api/providers")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ models?: ModelInfo[] }>;
      })
      .then((data) => setAvailableModels(data.models ?? []))
      .catch((err) => {
        console.error("Failed to fetch providers:", err);
        toast.error("Failed to load AI providers");
      })
      .finally(() => setModelsLoading(false));
  }, []);

  // ── Permalink (#rt=…) → read-only Run view ─────────────────
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    let active = true;
    decodeSnapshotFromHash(hash).then((snap) => {
      if (!active || !snap) return;
      const s = useArenaStore.getState();
      s.clearSweep();
      s.loadSnapshot(snap); // sharedView: true
      s.setView("run");
      toast.info("Viewing shared session");
    });
    return () => {
      active = false;
    };
  }, []);

  // ── Stop ───────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    const s = useArenaStore.getState();
    if (s.sweepActive && (s.isRunning || sweepLoop.current)) {
      s.cancelSweep();
      toast.info("Sweep stopped");
    } else if (s.isRunning) {
      s.cancelConsensus();
      toast.info("Run stopped");
    }
  }, []);

  // Esc stops the run from any view. Menus, tooltips and inline editors
  // handle their own Escape and stop it from reaching the window.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Esc in a text field means "clear / leave the field" (e.g. the History
      // search box), not "stop the run that is streaming in the background".
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.matches("input, textarea, select")))
        return;
      handleCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCancel]);

  // ── Run ────────────────────────────────────────────────────
  const startRun = useCallback(async (engine?: EngineType) => {
    const state = useArenaStore.getState();
    if (state.isRunning || sweepLoop.current) return;
    const blocker = getRunBlocker(state);
    if (blocker) {
      toast.error(blocker);
      return;
    }
    clearPermalinkHash();
    state.clearSweep();
    state.setView("run");
    toast.info("Run started — Esc stops it");
    await runOneEngine(engine);
  }, []);

  const handleRunConsensus = useCallback(() => startRun(), [startRun]);

  // Re-run keeps the engine of the run on screen, which after a sweep leg
  // or an opened Compare engines row is not the one Setup holds.
  const handleRerun = useCallback(
    () => startRun(useArenaStore.getState().runOptions?.engine),
    [startRun],
  );

  const handleRunSweep = useCallback(async () => {
    const state = useArenaStore.getState();
    if (state.isRunning || sweepLoop.current) return;
    const blocker = getRunBlocker(state);
    if (blocker) {
      toast.error(blocker);
      return;
    }
    clearPermalinkHash();
    state.startSweep(SWEEP_ENGINES);
    state.setView("run");
    toast.info(`Sweep started — running ${SWEEP_ENGINES.length} engines in turn. Esc cancels.`);

    sweepLoop.current = true;
    try {
      for (let i = 0; i < SWEEP_ENGINES.length; i++) {
        if (!useArenaStore.getState().sweepActive) break; // cancelled
        useArenaStore.getState().setSweepCurrentIndex(i);
        const engine = SWEEP_ENGINES[i];
        const outcome = await runOneEngine(engine);
        if (outcome !== "complete") {
          // Keep whichever engines finished; a partial run is not a result.
          if (outcome === "failed" && useArenaStore.getState().sweepActive) {
            toast.error(`Sweep stopped: ${engineLabel(engine)} failed.`);
          }
          break;
        }
        // `getSnapshot()` labels the leg with the engine it ran (`runOptions`);
        // the store's options still hold the user's pick.
        const done = useArenaStore.getState();
        done.pushSweepResult(done.getSnapshot());
      }
      const s = useArenaStore.getState();
      if (s.sweepActive && s.sweepResults.length === SWEEP_ENGINES.length) {
        toast.success("Sweep complete — compare the engines in the Run view.");
      }
    } finally {
      sweepLoop.current = false;
    }
  }, []);

  // ── Navigation between runs ────────────────────────────────
  const handleNewRun = useCallback(() => {
    handleCancel();
    clearPermalinkHash();
    useArenaStore.getState().setView("setup");
  }, [handleCancel]);

  // Loading a snapshot replaces the live run, so never do it by surprise.
  // Opening a Compare engines row shows that engine's run under its own
  // name: the sweep stops being "active" (no "Engine sweep" / "Sweep
  // complete") but its results stay so the table remains, and the user's
  // Setup options (engine, rounds, …) are kept rather than overwritten.
  const handleOpenSnapshot = useCallback((snapshot: SessionSnapshot) => {
    const s = useArenaStore.getState();
    if (s.isRunning || sweepLoop.current) {
      toast.info("Wait for the sweep to finish, or stop it, to open one engine's run.");
      return;
    }
    s.dismissSweep();
    s.loadSnapshot(snapshot, { sharedView: false, keepOptions: true });
  }, []);

  const handleOpenHistory = useCallback((entry: HistoryEntry) => {
    const s = useArenaStore.getState();
    if (s.isRunning || sweepLoop.current) {
      toast.info("A run is in progress — stop it before opening a saved run.");
      return;
    }
    clearPermalinkHash();
    s.clearSweep();
    s.loadSnapshot(entry.snapshot, { sharedView: false });
    s.setView("run");
  }, []);

  return (
    <AppShell
      historyCount={historyCount}
      headerActions={
        <a
          href="https://github.com/marceloceccon/askgrokmcp"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-[13px] text-fg-muted hover:text-fg lg:inline"
        >
          Protocol inspired by askgrokmcp
        </a>
      }
    >
      {view === "setup" && (
        <SetupView
          onRun={handleRunConsensus}
          onSweep={handleRunSweep}
          onCancel={handleCancel}
          showGettingStarted={historyCount === 0}
        />
      )}
      {view === "run" && (
        <RunView
          onCancel={handleCancel}
          onNewRun={handleNewRun}
          onRerun={handleRerun}
          onOpenSnapshot={handleOpenSnapshot}
        />
      )}
      {view === "history" && <HistoryView onOpen={handleOpenHistory} />}
    </AppShell>
  );
}

// ── Helpers ────────────────────────────────────────────────

function clearPermalinkHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** Best-effort error text for a non-OK /api/consensus response. */
async function describeHttpError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    /* not JSON */
  }
  return `HTTP ${response.status}`;
}

type RunOutcome = "complete" | "failed" | "aborted";

/**
 * Stream one run from /api/consensus into the store. `engineOverride`
 * replaces `options.engine` for this request only (the sweep); either way
 * the rounds are raised to the engine's minimum (Red team runs ≥ 3).
 */
async function runOneEngine(engineOverride?: EngineType): Promise<RunOutcome> {
  const state = useArenaStore.getState();
  const engine = engineOverride ?? state.options.engine;
  const controller = state.startConsensus(engine);
  const body: ConsensusRequest = {
    prompt: state.prompt.trim(),
    participants: state.participants,
    options: optionsForEngine(state.options, engine),
  };

  let outcome: RunOutcome | null = null;

  try {
    const response = await fetch("/api/consensus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(await describeHttpError(response));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) outcome = handleSseLine(line) ?? outcome;
    }
    for (const line of (buffer + decoder.decode()).split("\n")) {
      outcome = handleSseLine(line) ?? outcome;
    }
  } catch (err) {
    if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      return "aborted";
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    toast.error(`Consensus failed: ${msg}`);
    if (useArenaStore.getState().abortController === controller) {
      useArenaStore.getState().failConsensus(msg);
    }
    return "failed";
  }

  if (outcome) return outcome;
  if (controller.signal.aborted) return "aborted";
  // The stream closed without `consensus-complete` or `error`.
  const s = useArenaStore.getState();
  if (s.isRunning && s.abortController === controller) {
    const msg = "the stream ended before the run finished";
    toast.error(`Consensus failed: ${msg}`);
    s.failConsensus(msg);
  }
  return "failed";
}

/** Parse one `data: {...}` SSE line and apply it; malformed lines are skipped. */
function handleSseLine(line: string): "complete" | "failed" | null {
  if (!line.startsWith("data: ")) return null;
  try {
    return processEvent(JSON.parse(line.slice(6)) as ConsensusEvent);
  } catch {
    return null;
  }
}

// ── SSE Event Processor ────────────────────────────────────
// Tokens can arrive much faster than the screen can paint (often
// 100+/sec). We coalesce them per-participant in a buffer and
// flush once per animation frame so React/paint work is capped
// at ~60Hz instead of running on every chunk.

type TokenBuffer = Map<string, { round: number; text: string }>;
const tokenBuffer: TokenBuffer = new Map();
let judgeTokenBuffer = "";
let rafScheduled = false;

function scheduleFlush() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(flushTokens);
}

function flushTokens() {
  rafScheduled = false;
  const s = useArenaStore.getState();
  if (!s.isRunning) {
    tokenBuffer.clear();
    judgeTokenBuffer = "";
    return;
  }
  for (const [participantId, { round, text }] of tokenBuffer) {
    if (text) s.appendToken(participantId, round, text);
  }
  tokenBuffer.clear();
  if (judgeTokenBuffer) {
    s.appendJudgeToken(judgeTokenBuffer);
    judgeTokenBuffer = "";
  }
}

/** Apply one SSE event. Returns the run's outcome on a terminal event. */
function processEvent(event: ConsensusEvent): "complete" | "failed" | null {
  const s = useArenaStore.getState();
  if (!s.isRunning) return null;

  switch (event.type) {
    case "round-start":
      // Drain anything pending before a round transition to avoid
      // late tokens from the previous round arriving in the new one.
      flushTokens();
      s.startRound(event.round, event.roundType, event.label);
      break;
    case "participant-start":
      s.appendToken(event.participantId, event.round, "");
      break;
    case "token": {
      const existing = tokenBuffer.get(event.participantId);
      if (existing) existing.text += event.token;
      else tokenBuffer.set(event.participantId, { round: event.round, text: event.token });
      scheduleFlush();
      break;
    }
    case "participant-end":
      // Flush any buffered tokens for this participant before recording
      // the final result so the UI doesn't drop trailing characters.
      flushTokens();
      s.completeParticipantRound(
        event.participantId,
        event.round,
        event.confidence,
        event.fullContent,
        event.usage,
        event.durationMs,
        event.error,
      );
      if (event.error) {
        const p = s.participants.find((x) => x.id === event.participantId);
        const label = p
          ? `${p.modelInfo.providerName} / ${p.modelInfo.modelId}`
          : event.participantId;
        toast.error(`${label}: ${event.error}`);
      }
      break;
    case "round-end":
      flushTokens();
      s.endRound(event.round, event.consensusScore);
      break;
    case "disagreements":
      s.addDisagreements(event.round, event.disagreements);
      break;
    case "early-stop":
      s.setEarlyStopped({ round: event.round, delta: event.delta, reason: event.reason });
      break;
    case "judge-start":
      flushTokens();
      s.startJudge(event.modelId, event.providerName);
      break;
    case "judge-token":
      judgeTokenBuffer += event.token;
      scheduleFlush();
      break;
    case "judge-end":
      flushTokens();
      s.completeJudge(event.result);
      break;
    case "claims-start":
      s.startClaims(event.modelId, event.providerName);
      break;
    case "claims-end":
      s.completeClaims(event.digest);
      if (event.digest.error) {
        toast.error(`Claim extraction failed: ${event.digest.error}`);
      }
      break;
    case "consensus-complete": {
      flushTokens();
      s.completeConsensus(event.finalScore, event.summary, event.roundsCompleted);
      if (!s.sweepActive) toast.success(`Consensus complete! Score: ${event.finalScore}%`);
      const snapshot = s.getSnapshot();
      if (saveCompletedRun(snapshot)) toast.success("Saved to history");
      else if (snapshot.rounds.length > 0)
        toast.error("Couldn't save to history (storage unavailable or full)");
      return "complete";
    }
    case "error":
      tokenBuffer.clear();
      judgeTokenBuffer = "";
      toast.error(event.message);
      s.failConsensus(event.message);
      return "failed";
  }
  return null;
}
