export interface LogoProps {
  size?: number;
  /** Accessible name; omit when the logo sits next to visible "RoundTable" text. */
  title?: string;
  className?: string;
}

const SEATS = [0, 60, 120, 180, 240, 300].map((deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { cx: 16 + 12 * Math.cos(rad), cy: 16 + 12 * Math.sin(rad) };
});

/** Round-table mark: an accent table with six seats around it. */
export function Logo({ size = 24, title, className }: LogoProps) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} {...a11y}>
      <circle cx="16" cy="16" r="7" className="fill-accent" />
      {SEATS.map((s, i) => (
        <circle key={i} cx={s.cx.toFixed(2)} cy={s.cy.toFixed(2)} r="2.75" className="fill-fg" />
      ))}
    </svg>
  );
}
