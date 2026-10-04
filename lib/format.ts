// ─────────────────────────────────────────────────────────────
// RoundTable — Display formatters shared by the Run and History views
// ─────────────────────────────────────────────────────────────
// Pure functions. `Date.now()` defaults are taken here, outside the
// components, so render functions stay pure and tests can pass `now`.

/** U+2212 minus sign, used for every negative number the UI shows. */
export const MINUS = "−";

/** "$0.13", "$0.0042" below a cent, "—" when unknown (zero, null or not a number). */
export function formatCost(usd: number | null | undefined): string {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return "—";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** "42,700" — the exact count with en-US separators; "—" when unknown. */
export function formatTokens(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** Wall-clock duration: "850ms" · "42s" · "1m 42s" · "1h 3m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/** A signed whole-number delta: "+6" · "−3" · "0". */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${MINUS}${Math.abs(delta)}`;
  return "0";
}

/**
 * The signed change from `a` to `b`: "+6", "−6", "±0", or "—" when either
 * side is unknown. `format` renders the magnitude (e.g. a cost formatter).
 */
export function formatChange(
  a: number | null | undefined,
  b: number | null | undefined,
  format: (n: number) => string = (n) => String(n),
): string {
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(b - a)) return "—";
  const d = b - a;
  if (Math.abs(d) < 1e-9) return "±0";
  return `${d > 0 ? "+" : MINUS}${format(Math.abs(d))}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

let rtf: Intl.RelativeTimeFormat | null = null;
function relative(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  rtf ??= new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return rtf.format(value, unit);
}

/**
 * "just now" · "5 minutes ago" · "3 hours ago" · "yesterday" · "4 days ago",
 * then a short date ("Sep 12", or "Sep 12, 2025" in another year).
 */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return "just now";
  if (abs < HOUR) return relative(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return relative(Math.round(diff / HOUR), "hour");
  if (abs < 7 * DAY) return relative(Math.round(diff / DAY), "day");
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(
    "en",
    sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" },
  );
}

/** Full local date and time, for `title` attributes and the compare table. */
export function formatAbsoluteTime(ts: number): string {
  return new Date(ts).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

/** Shorten to at most `max` characters, cut on a word boundary, with an ellipsis. */
export function excerpt(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const CONFIDENCE_TAIL = /\n?CONFIDENCE:\s*\d+\s*$/i;
const JUDGE_CONFIDENCE_TAIL = /\n?JUDGE_CONFIDENCE:\s*\d+\s*$/i;

/** Drop the trailing `CONFIDENCE: N` line every participant answer ends with. */
export function stripConfidence(content: string): string {
  return content.replace(CONFIDENCE_TAIL, "").trim();
}

/** Drop the trailing `JUDGE_CONFIDENCE: N` line of the judge synthesis. */
export function stripJudgeConfidence(content: string): string {
  return content.replace(JUDGE_CONFIDENCE_TAIL, "").trim();
}
