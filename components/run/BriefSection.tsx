"use client";

// ─────────────────────────────────────────────────────────────
// BriefSection — titled card used by every block of the run view
// ─────────────────────────────────────────────────────────────

import { useId, type ReactNode } from "react";
import { Card, cn } from "@/components/ui";

export interface BriefSectionProps {
  title: ReactNode;
  /** One muted line under the title (model, method, …). */
  meta?: ReactNode;
  /** Right side of the title row (count badge, live indicator, …). */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** A `<section>` card labelled by its `<h2>` so it is a named landmark region. */
export function BriefSection({ title, meta, aside, children, className }: BriefSectionProps) {
  const headingId = `brief-${useId()}`;
  return (
    <Card as="section" aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-fg">
            {title}
          </h2>
          {meta && <p className="mt-0.5 text-[13px] text-fg-muted">{meta}</p>}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Muted one-line note used for "not yet" / "not enabled" states. */
export function MutedNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm text-fg-muted", className)}>{children}</p>;
}
