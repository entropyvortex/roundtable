import { cn } from "./cn";

/** A participant's persona colour as a small dot. Decorative: the name always sits beside it. */
export function PersonaDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}
