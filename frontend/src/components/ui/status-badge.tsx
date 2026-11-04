import { cn } from "@/lib/utils";
import type { AgreementStatus, MilestoneStatus } from "@/types/agreement";

export const STATUS_META: Record<AgreementStatus, { label: string; className: string; dot: string }> = {
  Created: { label: "Created", className: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  Accepted: { label: "Accepted", className: "bg-cyan-50 text-cyan-700 ring-cyan-100", dot: "bg-cyan-500" },
  InProgress: { label: "In Progress", className: "bg-brand-50 text-brand-700 ring-brand-100", dot: "bg-brand-500" },
  Delivered: { label: "Delivered", className: "bg-amber-50 text-amber-700 ring-amber-100", dot: "bg-amber-500" },
  Completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-100", dot: "bg-emerald-500" },
  Cancelled: { label: "Cancelled", className: "bg-slate-50 text-slate-500 ring-slate-200", dot: "bg-slate-300" },
  Disputed: { label: "Disputed", className: "bg-rose-50 text-rose-700 ring-rose-100", dot: "bg-rose-500" },
};

export function StatusBadge({ status, className }: { status: AgreementStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

const MILESTONE_META: Record<MilestoneStatus, { label: string; className: string }> = {
  Pending: { label: "Pending", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  Submitted: { label: "Awaiting approval", className: "bg-amber-50 text-amber-700 ring-amber-100" },
  Released: { label: "Released", className: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
};

export function MilestoneBadge({ status }: { status: MilestoneStatus }) {
  const meta = MILESTONE_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600",
        className,
      )}
      {...props}
    />
  );
}
