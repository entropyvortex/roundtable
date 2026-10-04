"use client";

// ─────────────────────────────────────────────────────────────
// RunView — header, then Brief (answer) beside Transcript (evidence)
// ─────────────────────────────────────────────────────────────
// Layout is CSS-only: ≥ lg a two-column grid (Brief + Signals left,
// Transcript right); below lg the same three panes become tabs. Each
// pane renders exactly once so anchors and ids stay unique.

import { useCallback, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import type { SessionSnapshot } from "@/lib/types";
import { Button, EmptyState, TabPanel, Tabs, cn, type TabItem } from "@/components/ui";
import RunHeader from "./RunHeader";
import CompareEngines from "./CompareEngines";
import Brief from "./Brief";
import Signals from "./Signals";
import Transcript from "./Transcript";
import { useTranscriptNav, type JumpTarget } from "./navigation";

export interface RunViewProps {
  /** Stop the running run or sweep (page: cancelSweep / cancelConsensus). */
  onCancel: () => void;
  /** Go to Setup for a new question / panel. */
  onNewRun: () => void;
  /** Run the current question + panel again. */
  onRerun: () => void;
  /** Load one sweep engine's snapshot into the run view. */
  onOpenSnapshot: (snapshot: SessionSnapshot) => void;
}

type Pane = "brief" | "transcript" | "signals";

const PANE_ID_BASE = "run-pane";
const PANES: TabItem<Pane>[] = [
  { id: "brief", label: "Brief" },
  { id: "transcript", label: "Transcript" },
  { id: "signals", label: "Signals" },
];

export default function RunView({ onCancel, onNewRun, onRerun, onOpenSnapshot }: RunViewProps) {
  const hasRounds = useArenaStore((s) => s.rounds.length > 0);
  const isRunning = useArenaStore((s) => s.isRunning);
  const sweepActive = useArenaStore((s) => s.sweepActive);
  const hasSweepResults = useArenaStore((s) => s.sweepResults.length > 0);
  const runStartedAt = useArenaStore((s) => s.runStartedAt);
  const finalScore = useArenaStore((s) => s.finalScore);

  const empty =
    !hasRounds &&
    !isRunning &&
    !sweepActive &&
    !hasSweepResults &&
    runStartedAt === null &&
    finalScore === null;

  if (empty) {
    return (
      <EmptyState
        icon={<MessagesSquare />}
        title="No run yet"
        description="Ask a question, pick a panel and run it. The brief and the full transcript will appear here."
        action={
          <Button variant="primary" onClick={onNewRun}>
            New run
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <RunHeader onCancel={onCancel} onNewRun={onNewRun} onRerun={onRerun} />
      <CompareEngines onOpenSnapshot={onOpenSnapshot} />
      {/* Fresh pane / round state for every new run. */}
      <RunPanes key={runStartedAt ?? "loaded"} />
    </div>
  );
}

function RunPanes() {
  const [pane, setPane] = useState<Pane>("brief");
  const nav = useTranscriptNav();
  const { jumpTo } = nav;

  const jump = useCallback(
    (target: JumpTarget) => {
      jumpTo(target);
      setPane("transcript");
    },
    [jumpTo],
  );
  const openRound = useCallback((round: number) => jump({ round }), [jump]);

  const paneClass = (id: Pane) => cn(pane === id ? "block" : "hidden", "lg:block");

  return (
    <div>
      <Tabs
        items={PANES}
        value={pane}
        onChange={setPane}
        label="Run sections"
        idBase={PANE_ID_BASE}
        className="mb-4 lg:hidden"
      />
      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr] lg:gap-6">
        <TabPanel
          idBase={PANE_ID_BASE}
          id="brief"
          className={cn(paneClass("brief"), "lg:col-start-1 lg:row-start-1")}
        >
          <Brief onJump={jump} />
        </TabPanel>
        <TabPanel
          idBase={PANE_ID_BASE}
          id="signals"
          className={cn(paneClass("signals"), "lg:col-start-1 lg:row-start-2 lg:self-start")}
        >
          <Signals onSelectRound={openRound} />
        </TabPanel>
        <TabPanel
          idBase={PANE_ID_BASE}
          id="transcript"
          tabIndex={0}
          className={cn(
            paneClass("transcript"),
            "lg:sticky lg:top-[calc(var(--header-h)_+_16px)] lg:col-start-2 lg:row-span-2 lg:row-start-1",
            "lg:max-h-[calc(100vh_-_var(--header-h)_-_32px)] lg:self-start lg:overflow-y-auto lg:pr-1",
          )}
        >
          <Transcript nav={nav} />
        </TabPanel>
      </div>
    </div>
  );
}
