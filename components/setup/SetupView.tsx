"use client";

// ─────────────────────────────────────────────────────────────
// SetupView — Question · Panel · Protocol · Estimate + Run
// ─────────────────────────────────────────────────────────────
// A single centered column. All state lives in the store; the page
// supplies the run / sweep / cancel handlers.

import { useCallback } from "react";
import { getRunBlocker } from "@/lib/run-blocker";
import { useArenaStore } from "@/lib/store";
import EstimateBar from "./EstimateBar";
import GettingStarted from "./GettingStarted";
import PanelEditor from "./PanelEditor";
import ProtocolPicker from "./ProtocolPicker";
import QuestionEditor from "./QuestionEditor";

export interface SetupViewProps {
  /** Start a single run (page's run handler). */
  onRun: () => void;
  /** Run all three engines back to back (page's sweep handler). */
  onSweep: () => void;
  /** Stop the run or sweep in flight. */
  onCancel: () => void;
  /** Show the 3-step explainer (e.g. while history is empty). */
  showGettingStarted?: boolean;
}

export default function SetupView({
  onRun,
  onSweep,
  onCancel,
  showGettingStarted = false,
}: SetupViewProps) {
  // Ctrl/⌘ + Enter in the question box runs, but only when Run is enabled.
  const submitFromKeyboard = useCallback(() => {
    const s = useArenaStore.getState();
    if (s.isRunning || getRunBlocker(s)) return;
    onRun();
  }, [onRun]);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Ask the table</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Put one question to a panel of AI models and get a brief of where they agree, where they
          split and how confident they are.
        </p>
      </header>
      {showGettingStarted && <GettingStarted />}
      <QuestionEditor onSubmit={submitFromKeyboard} />
      <PanelEditor />
      <ProtocolPicker />
      <EstimateBar onRun={onRun} onSweep={onSweep} onCancel={onCancel} />
    </div>
  );
}
