import { useRef } from "react";

/**
 * Index the key moves to in a roving-tabindex list (wrapping), or null
 * when the key is not a navigation key. `vertical` also accepts ↑/↓.
 */
export function rovingTarget(
  key: string,
  current: number,
  count: number,
  vertical = false,
): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight" || (vertical && key === "ArrowDown")) return (current + 1) % count;
  if (key === "ArrowLeft" || (vertical && key === "ArrowUp")) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Index ↑/↓/Home/End move to in a vertical menu (wrapping), or null for other keys. */
export function menuTarget(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** A map of item id → element, filled through `register(id)` ref callbacks. */
export function useItemRefs<T extends HTMLElement>() {
  const refs = useRef(new Map<string, T>());
  const register = (id: string) => (el: T | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };
  return { refs, register };
}
