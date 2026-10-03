"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export interface FieldIds {
  /** id for the control (the label points at it). */
  id: string;
  /** Space-separated ids of the help / error text, if any. */
  describedBy: string | undefined;
  invalid: boolean;
}

export interface FieldProps {
  label: ReactNode;
  /** Help text under the control. */
  help?: ReactNode;
  /** Error text; marks the control `aria-invalid`. */
  error?: ReactNode;
  required?: boolean;
  /** Control id (defaults to the child's id, else a generated one). */
  id?: string;
  /** Right side of the label row, e.g. a character counter. */
  aside?: ReactNode;
  className?: string;
  /**
   * A single control element (id / aria-describedby / aria-invalid are
   * injected) or a render function that receives the ids.
   */
  children: ReactElement | ((ids: FieldIds) => ReactNode);
}

/** Label + control + help + error, wired together for assistive tech. */
export function Field({
  label,
  help,
  error,
  required,
  id,
  aside,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const childProps =
    typeof children !== "function" && isValidElement(children)
      ? (children.props as Record<string, unknown>)
      : {};
  const controlId = id ?? (childProps.id as string | undefined) ?? `field-${autoId}`;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [childProps["aria-describedby"], helpId, errorId].filter(Boolean).join(" ");
  const ids: FieldIds = { id: controlId, describedBy: describedBy || undefined, invalid: !!error };

  let control: ReactNode;
  if (typeof children === "function") {
    control = children(ids);
  } else {
    control = cloneElement(children as ReactElement<Record<string, unknown>>, {
      id: controlId,
      "aria-describedby": ids.describedBy,
      ...(error ? { "aria-invalid": true } : {}),
      ...(required ? { required: true } : {}),
    });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={controlId} className="text-sm font-medium text-fg">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          )}
        </label>
        {aside && <div className="text-[13px] text-fg-muted tabular-nums">{aside}</div>}
      </div>
      {control}
      {help && (
        <p id={helpId} className="text-[13px] leading-snug text-fg-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] leading-snug text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-fg " +
  "placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-danger";

export function Input({ className, ...rest }: ComponentPropsWithRef<"input">) {
  return <input className={cn(INPUT_CLASS, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      className={cn(INPUT_CLASS, "min-h-[6rem] py-2 text-[15px] leading-relaxed", className)}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: ComponentPropsWithRef<"select">) {
  return <select className={cn(INPUT_CLASS, "h-10 pr-8", className)} {...rest} />;
}
