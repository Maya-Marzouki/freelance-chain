import { AlertOctagon, Ban, Check } from "lucide-react";
import { HAPPY_PATH } from "@/lib/lifecycle";
import { STATUS_META } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { ActivityType, Agreement } from "@/types/agreement";

const STEP_EVENTS: ActivityType[] = ["AgreementCreated", "AgreementAccepted", "WorkStarted", "DeliverySubmitted"];

/** Index of the last happy-path step the agreement reached. */
function reachedIndex(agreement: Agreement): number {
  if (agreement.status !== "Cancelled" && agreement.status !== "Disputed") {
    return HAPPY_PATH.indexOf(agreement.status);
  }
  return Math.max(0, ...agreement.timeline.map((e) => STEP_EVENTS.indexOf(e.type)));
}

/** Horizontal progress indicator across the agreement's happy path. */
export function LifecycleStepper({ agreement }: { agreement: Agreement }) {
  const { status } = agreement;
  const terminal = status === "Cancelled" || status === "Disputed";
  const reached = reachedIndex(agreement);

  return (
    <div>
      <ol className="flex items-center" aria-label="Agreement lifecycle">
        {HAPPY_PATH.map((s, i) => {
          const done = terminal ? i <= reached : i < reached || status === "Completed";
          const current = !terminal && i === reached && status !== "Completed";
          const stopped = terminal && i === reached + 1;
          const label = stopped ? STATUS_META[status].label : STATUS_META[s].label;
          return (
            <li key={s} className={cn("flex items-center", i < HAPPY_PATH.length - 1 && "flex-1")}>
              <div className="flex flex-col items-center gap-2">
                <span
                  aria-current={current ? "step" : undefined}
                  aria-label={`${label}${done ? " (done)" : current ? " (current)" : ""}`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition",
                    done && "border-brand-500 bg-brand-500 text-white",
                    current && "border-brand-500 bg-white text-brand-600 ring-4 ring-brand-100",
                    stopped && status === "Disputed" && "border-rose-500 bg-rose-500 text-white",
                    stopped && status === "Cancelled" && "border-slate-400 bg-slate-400 text-white",
                    !done && !current && !stopped && "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {stopped ? (
                    status === "Disputed" ? <AlertOctagon className="size-4" /> : <Ban className="size-4" />
                  ) : done ? (
                    <Check className="size-4" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-medium whitespace-nowrap sm:block",
                    done || current ? "text-navy-900" : "text-slate-400",
                    stopped && (status === "Disputed" ? "text-rose-600" : "text-slate-500"),
                  )}
                >
                  {label}
                </span>
              </div>
              {i < HAPPY_PATH.length - 1 && (
                <span
                  className={cn(
                    "mx-2 h-0.5 flex-1 rounded-full sm:mb-6",
                    i < reached || (status === "Completed" && i < HAPPY_PATH.length - 1) ? "bg-brand-500" : "bg-slate-200",
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-center text-xs text-slate-500 sm:hidden">
        Current status: <span className="font-medium text-navy-900">{STATUS_META[status].label}</span>
      </p>
    </div>
  );
}
