import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

const FIELD =
  "block w-full rounded-lg border bg-white px-3.5 text-sm text-navy-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500";
const OK = "border-slate-200 focus:border-brand-400 focus:ring-brand-100";
const BAD = "border-rose-300 focus:border-rose-400 focus:ring-rose-100";

interface FieldProps {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
  className?: string;
}

/** Label + control + hint/error wiring with proper aria attributes. */
export function Field({ label, hint, error, optional, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-navy-800">
        {label}
        {optional && <span className="text-xs font-normal text-slate-400">Optional</span>}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {error ? (
        <p id={hintId} className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leading, trailing, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      {leading && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 [&_svg]:size-4">
          {leading}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          FIELD,
          "h-10",
          invalid ? BAD : OK,
          leading ? "pl-9" : undefined,
          trailing ? "pr-14" : undefined,
          className,
        )}
        {...props}
      />
      {trailing && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-500">
          {trailing}
        </span>
      )}
    </div>
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(FIELD, "min-h-28 py-2.5 leading-relaxed", invalid ? BAD : OK, className)}
      {...props}
    />
  );
});

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, OK, "h-10 cursor-pointer pr-8", className)} {...props} />;
}
