"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

// useLayoutEffect warns during SSR; this file only positions on the client.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface PopoverProps {
  open: boolean;
  /** Called on outside pointer-down or Escape. */
  onClose: () => void;
  /** Element the popover is positioned against (and that keeps it open when clicked). */
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Align the popover's left (start) or right (end) edge with the anchor. */
  align?: "start" | "end";
  /** Make the popover at least as wide as the anchor. */
  matchAnchorWidth?: boolean;
  /** Return focus to the anchor after Escape (default true). */
  restoreFocus?: boolean;
  role?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Receives the floating element once positioned (e.g. to move focus inside). */
  onOpened?: (el: HTMLDivElement) => void;
}

const GAP = 4;
const MARGIN = 8;

/**
 * Floating layer rendered in a portal on <body> with `position: fixed`,
 * positioned under its anchor (flips above when there is no room),
 * clamped to the viewport. Closes on outside pointer-down and Escape.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  align = "start",
  matchAnchorWidth,
  restoreFocus = true,
  role = "dialog",
  id,
  className,
  onKeyDown,
  onOpened,
  ...aria
}: PopoverProps) {
  const floatingRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onOpenedRef = useRef(onOpened);
  useIsoLayoutEffect(() => {
    onCloseRef.current = onClose;
    onOpenedRef.current = onOpened;
  });

  // Position directly on the DOM node — no state, no re-render.
  useIsoLayoutEffect(() => {
    if (!open) return;
    const el = floatingRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (matchAnchorWidth) el.style.minWidth = `${r.width}px`;
      el.style.maxWidth = `${Math.max(0, vw - MARGIN * 2)}px`;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = align === "end" ? r.right - w : r.left;
      left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - w - MARGIN));
      const below = r.bottom + GAP;
      let top = below + h > vh - MARGIN && r.top - GAP - h >= MARGIN ? r.top - GAP - h : below;
      top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    };
    place();
    onOpenedRef.current?.(el);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // Content can change size while open (e.g. a menu drilling into a
    // longer list); keep the layer on screen.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(el);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      observer?.disconnect();
    };
  }, [open, align, matchAnchorWidth, anchorRef]);

  // Dismissal.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (floatingRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseRef.current();
      if (restoreFocus) anchorRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, restoreFocus]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={floatingRef}
      id={id}
      role={role}
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className={cn(
        "z-[1000] overflow-auto rounded-card border border-border bg-surface text-fg shadow-popover",
        "max-h-[min(24rem,calc(100vh-16px))] animate-fade-in",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
