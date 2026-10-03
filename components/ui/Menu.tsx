"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefCallback,
} from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./Button";
import { cn } from "./cn";
import { Popover } from "./Popover";
import { menuTarget } from "./roving";

export interface MenuItem {
  id: string;
  label: ReactNode;
  /** Secondary line under the label. */
  description?: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders in the danger colour. */
  danger?: boolean;
  /** When defined the item is a `menuitemradio` with this checked state. */
  checked?: boolean;
}

export interface MenuProps {
  /** Trigger button content. */
  label: ReactNode;
  /** Accessible name for the trigger when `label` is icon-only. */
  "aria-label"?: string;
  items: MenuItem[];
  align?: "start" | "end";
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Show a chevron after the label (default true). */
  chevron?: boolean;
  /** Menu at least as wide as the trigger. */
  matchTriggerWidth?: boolean;
  className?: string;
  menuClassName?: string;
  /** Receives the trigger button, e.g. to return focus to it after a confirmation. */
  triggerRef?: RefCallback<HTMLButtonElement>;
}

/** Enabled items of a menu built from `menuitem` / `menuitemradio` buttons. */
export const MENU_ITEM_SELECTOR = '[role^="menuitem"]:not([disabled])';

/**
 * Button + popup menu. Keyboard: Enter/Space/↓ open on the first item,
 * ↑ opens on the last; ↑/↓/Home/End move; Escape or Tab close and return
 * focus to the trigger; outside click closes. Rendered in a portal.
 */
export function Menu({
  label,
  items,
  align = "start",
  variant = "secondary",
  size = "md",
  disabled,
  chevron = true,
  matchTriggerWidth,
  className,
  menuClassName,
  triggerRef: externalRef,
  ...aria
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const setTriggerRef = (el: HTMLButtonElement | null) => {
    triggerRef.current = el;
    externalRef?.(el);
  };
  const focusOnOpen = useRef<"first" | "last">("first");
  const menuId = `menu-${useId()}`;

  const close = (restore = true) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  };

  const itemsOf = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR));

  const onOpened = (el: HTMLDivElement) => {
    const list = itemsOf(el);
    (focusOnOpen.current === "last" ? list[list.length - 1] : list[0])?.focus();
  };

  const openWith = (where: "first" | "last") => {
    focusOnOpen.current = where;
    setOpen(true);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openWith("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openWith("last");
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = itemsOf(e.currentTarget);
    if (list.length === 0) return;
    if (e.key === "Tab") {
      e.preventDefault();
      close();
      return;
    }
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = menuTarget(e.key, i, list.length);
    if (next === null) return;
    e.preventDefault();
    list[next].focus();
  };

  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={aria["aria-label"]}
        disabled={disabled}
        onClick={() => (open ? close(false) : openWith("first"))}
        onKeyDown={onTriggerKeyDown}
        className={buttonClass(variant, size, className)}
      >
        {label}
        {chevron && (
          <ChevronDown
            aria-hidden
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
          />
        )}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        align={align}
        matchAnchorWidth={matchTriggerWidth}
        role="menu"
        id={menuId}
        aria-label={aria["aria-label"] ?? (typeof label === "string" ? label : undefined)}
        onKeyDown={onMenuKeyDown}
        onOpened={onOpened}
        className={cn("min-w-[12rem] p-1", menuClassName)}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={item.checked === undefined ? undefined : item.checked}
            tabIndex={-1}
            disabled={item.disabled}
            onClick={() => {
              close();
              item.onSelect();
            }}
            className={cn(
              "flex w-full items-start gap-2 rounded-[6px] px-2.5 py-2 text-left text-sm",
              "hover:bg-surface-2 focus:bg-surface-2 focus-visible:outline-offset-[-2px]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              item.danger ? "text-danger" : "text-fg",
            )}
          >
            {item.checked !== undefined && (
              <Check
                aria-hidden
                className={cn("mt-0.5 h-4 w-4 shrink-0", !item.checked && "invisible")}
              />
            )}
            {item.icon && (
              <span aria-hidden className="mt-0.5 inline-flex shrink-0">
                {item.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block">{item.label}</span>
              {item.description && (
                <span className="block text-[13px] text-fg-muted">{item.description}</span>
              )}
            </span>
          </button>
        ))}
      </Popover>
    </>
  );
}
