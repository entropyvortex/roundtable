"use client";

// ─────────────────────────────────────────────────────────────
// AppShell — sticky header (brand · view switch · theme) + view slot
// ─────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { useArenaStore } from "@/lib/store";
import type { AppView } from "@/lib/types";
import { Badge, Logo, TabPanel, Tabs, ThemeToggle, type TabItem } from "@/components/ui";

const VIEW_ID_BASE = "rt-view";

export interface AppShellProps {
  /** The active view's content. */
  children: ReactNode;
  /** Saved-run count shown on the History tab (hidden when 0/undefined). */
  historyCount?: number;
  /** Extra header content, right-aligned before the theme toggle. */
  headerActions?: ReactNode;
}

export default function AppShell({ children, historyCount, headerActions }: AppShellProps) {
  const view = useArenaStore((s) => s.view);
  const setView = useArenaStore((s) => s.setView);

  const items: TabItem<AppView>[] = [
    { id: "setup", label: "Setup" },
    { id: "run", label: "Run" },
    {
      id: "history",
      label: "History",
      badge:
        historyCount && historyCount > 0 ? (
          <Badge>
            {historyCount}{" "}
            <span className="sr-only">saved {historyCount === 1 ? "run" : "runs"}</span>
          </Badge>
        ) : undefined,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <a
        href="#rt-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-bg">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <div className="flex shrink-0 items-center gap-2">
            <Logo size={24} />
            <span className="sr-only text-[15px] font-semibold tracking-tight sm:not-sr-only">
              RoundTable
            </span>
          </div>
          <Tabs
            items={items}
            value={view}
            onChange={setView}
            label="Views"
            idBase={VIEW_ID_BASE}
            variant="pill"
            className="sm:ml-3"
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {headerActions}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="rt-main" tabIndex={-1} className="flex-1 focus:outline-none">
        <TabPanel
          idBase={VIEW_ID_BASE}
          id={view}
          className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6"
        >
          {children}
        </TabPanel>
      </main>
    </div>
  );
}
