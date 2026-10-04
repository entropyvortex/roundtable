"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export interface TooltipProps {
  content: ReactNode;
  /** A single focusable element; it gets `aria-describedby` pointing at the tooltip. */
  children: ReactElement;
  side?: "top" | "bottom";
  className?: string;
}

/**
 * Hover + focus tooltip. The tooltip node is always rendered (hidden when
 * closed) so `aria-describedby` always resolves. While open, Escape
 * dismisses it wherever focus is, and the pointer can move onto the
 * bubble without closing it (the gap to the trigger is padding, not margin).
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = `tooltip-${useId()}`;
  const childProps = children.props as { "aria-describedby"?: string };
  const describedBy = [childProps["aria-describedby"], id].filter(Boolean).join(" ");

  // Escape with focus elsewhere (a hover-only tooltip) still dismisses it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy,
      })}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={cn(
          "absolute left-1/2 z-50 -translate-x-1/2",
          side === "top" ? "bottom-full pb-2" : "top-full pt-2",
        )}
      >
        <span
          className={cn(
            "block w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-control bg-fg px-2.5 py-1.5",
            "text-[13px] font-normal leading-snug text-bg shadow-popover",
            className,
          )}
        >
          {content}
        </span>
      </span>
    </span>
  );
}
