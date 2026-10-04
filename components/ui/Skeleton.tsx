import { cn } from "./cn";

/** Grey placeholder block for content that is still loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("animate-pulse rounded-control bg-surface-2", className)} />
  );
}
