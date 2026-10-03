// ─────────────────────────────────────────────────────────────
// GettingStarted — inline 3-step explainer for first-time users
// ─────────────────────────────────────────────────────────────
// No overlay, no timer: the page shows it above the form until the
// user has at least one saved run.

import { useId } from "react";
import { MAX_SEATS, MIN_SEATS } from "@/lib/limits";
import { cn } from "@/components/ui";

export interface GettingStartedProps {
  className?: string;
}

const STEPS = [
  {
    title: "Ask",
    body: "Write the decision or question you want tested, with the context that matters.",
  },
  {
    title: "Pick a panel",
    body: `Seat ${MIN_SEATS}–${MAX_SEATS} AI models, each with a persona. A preset is the quickest start.`,
  },
  {
    title: "Run and read the brief",
    body: "Check the estimate, run it, then read where they agreed, where they split and who changed their mind.",
  },
];

export default function GettingStarted({ className }: GettingStartedProps) {
  const headingId = `getting-started-${useId()}`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn("rounded-card border border-border bg-surface-2 p-4 sm:p-5", className)}
    >
      <h2 id={headingId} className="text-base font-semibold text-fg">
        How it works
      </h2>
      <ol className="mt-3 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-fg tabular-nums"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{step.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
