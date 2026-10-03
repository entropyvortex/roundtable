import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Call-to-action (e.g. a <Button>). */
  action?: ReactNode;
  /** Heading level for the title (default h2). */
  as?: "h2" | "h3";
  className?: string;
}

/** Plain "nothing here yet — here's what to do" block. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  as = "h2",
  className,
}: EmptyStateProps) {
  const Heading = as;
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-card border border-dashed border-border px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div aria-hidden className="mb-3 text-fg-muted [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <Heading className="text-base font-semibold text-fg">{title}</Heading>
      {description && <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
