import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "li";
  padding?: "none" | "sm" | "md";
}

const PADDING = { none: "", sm: "p-3", md: "p-4 sm:p-5" } as const;

/** Flat surface: 1px border, 12px radius, no shadow. */
export function Card({ as = "div", padding = "md", className, ...rest }: CardProps) {
  const Tag: ElementType = as;
  return (
    <Tag
      className={cn("rounded-card border border-border bg-surface", PADDING[padding], className)}
      {...rest}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (buttons, menus). */
  actions?: ReactNode;
  /** Heading level for the title (default h2). */
  as?: "h2" | "h3" | "h4";
  className?: string;
}

export function CardHeader({ title, description, actions, as = "h2", className }: CardHeaderProps) {
  const Heading = as;
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <Heading className="text-base font-semibold text-fg">{title}</Heading>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
