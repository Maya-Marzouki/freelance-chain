"use client";

import { useState } from "react";
import { Banknote, HandCoins, Undo2, Vault } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { cn, formatEth } from "@/lib/utils";
import type { Agreement, EscrowStatus, Role } from "@/types/agreement";
import { CreateEscrowDialog } from "./create-escrow-dialog";

const STATUS_STYLE: Record<EscrowStatus, string> = {
  Created: "bg-slate-100 text-slate-600 ring-slate-200",
  Funded: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  InProgress: "bg-brand-50 text-brand-700 ring-brand-100",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  Cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLE[status])}>
      {status === "InProgress" ? "In progress" : status}
    </span>
  );
}

interface Confirmation {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  success: string;
  run: () => Promise<string>;
}

interface Props {
  agreement: Agreement;
  /** Role of the connected wallet on this agreement. */
  role: Role;
}

/** Live-mode controls of the escrow contract (B) for one agreement. */
export function EscrowControls({ agreement, role }: Props) {
  const { escrows, escrowEnabled, fundEscrow, settleEscrow } = useAppStore();
  const toast = useToast();
  const [setupOpen, setSetupOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(false);

  if (!escrowEnabled) return null;

  const escrow = escrows.find((e) => e.agreementId === agreement.id);
  const accepted = ["Accepted", "InProgress", "Delivered"].includes(agreement.status);

  async function confirm() {
    if (!confirmation) return;
    setLoading(true);
    try {
      await confirmation.run();
      toast.success(confirmation.success, "Confirmed on the blockchain.");
      setConfirmation(null);
    } catch (err) {
      toast.error("Action failed", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const note = (text: string) => <p className="text-sm text-slate-500">{text}</p>;

  let body: React.ReactNode;
  if (!escrow) {
    body =
      role === "client" && ["Created", "Accepted", "InProgress"].includes(agreement.status) ? (
        <>
          {note("No funds are locked yet. Split the payment into milestones and lock it in escrow.")}
          <Button size="sm" onClick={() => setSetupOpen(true)}>
            <Vault className="size-4" aria-hidden /> Set up escrow
          </Button>
        </>
      ) : (
        note("No escrow has been set up for this agreement.")
      );
  } else {
    const id = escrow.escrowId;
    const open = escrow.status === "Created" || escrow.status === "Funded" || escrow.status === "InProgress";
    // B follows the final status of A: Completed pays the freelancer, Cancelled refunds the client.
    const finished = agreement.status === "Completed" || agreement.status === "Cancelled";
    const remaining = escrow.depositedEth - escrow.releasedEth;
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs text-slate-400">{escrow.id}</span>
          <EscrowStatusBadge status={escrow.status} />
          <span className="text-slate-500">
            {formatEth(escrow.depositedEth, 6)} locked · {formatEth(escrow.releasedEth, 6)} released
          </span>
        </div>

        {escrow.status === "Created" && !finished &&
          (role === "client" ? (
            <>
              {note(accepted ? "Deposit the full amount to start. It stays locked until you approve each milestone." : "Wait for the freelancer to accept the agreement before funding.")}
              <Button
                size="sm"
                disabled={!accepted}
                onClick={() =>
                  setConfirmation({
                    title: "Fund the escrow?",
                    body: `${formatEth(escrow.totalEth, 6)} will be sent from your wallet and locked in the escrow contract.`,
                    label: "Fund escrow",
                    success: "Escrow funded",
                    run: () => fundEscrow(id),
                  })
                }
              >
                <Banknote className="size-4" aria-hidden /> Fund {formatEth(escrow.totalEth, 6)}
              </Button>
            </>
          ) : (
            note("Waiting for the client to fund the escrow.")
          ))}

        {(escrow.status === "Funded" || escrow.status === "InProgress") && !finished && (
          <>
            {agreement.status === "Disputed"
              ? note("Milestones are frozen while the agreement is disputed. The funds follow the outcome of the dispute.")
              : note("Funds are released milestone by milestone. If the agreement is cancelled or completed, settle the escrow to move what is left.")}
            {role === "client" && agreement.status === "Accepted" && note("To get a refund before work starts, cancel the agreement then settle the escrow.")}
          </>
        )}

        {open && finished && (
          <>
            {note(
              agreement.status === "Completed"
                ? `The agreement is completed: the remaining ${formatEth(remaining, 6)} go to the freelancer.`
                : `The agreement is cancelled: the remaining ${formatEth(remaining, 6)} return to the client.`,
            )}
            <Button
              size="sm"
              variant={agreement.status === "Completed" ? "primary" : "outline"}
              onClick={() =>
                setConfirmation({
                  title: "Settle the escrow?",
                  body:
                    agreement.status === "Completed"
                      ? `${formatEth(remaining, 6)} will be sent to the freelancer. Anyone can trigger this.`
                      : `${formatEth(remaining, 6)} will be sent back to the client. Anyone can trigger this.`,
                  label: "Settle escrow",
                  success: "Escrow settled",
                  run: () => settleEscrow(id),
                })
              }
            >
              {agreement.status === "Completed" ? (
                <>
                  <HandCoins className="size-4" aria-hidden /> Pay freelancer {formatEth(remaining, 6)}
                </>
              ) : (
                <>
                  <Undo2 className="size-4" aria-hidden /> Refund client {formatEth(remaining, 6)}
                </>
              )}
            </Button>
          </>
        )}

        {escrow.status === "Completed" && note("All funds were released to the freelancer.")}
        {escrow.status === "Cancelled" && note("The escrow is closed. Remaining funds went back to the client.")}
      </>
    );
  }

  return (
    <div className="space-y-3">
      {body}
      <CreateEscrowDialog key={setupOpen ? "open" : "closed"} open={setupOpen} onClose={() => setSetupOpen(false)} agreement={agreement} />
      <ConfirmDialog
        open={!!confirmation}
        onClose={() => !loading && setConfirmation(null)}
        onConfirm={confirm}
        loading={loading}
        title={confirmation?.title ?? ""}
        description={confirmation?.body ?? ""}
        confirmLabel={confirmation?.label ?? "Confirm"}
        tone={confirmation?.danger ? "danger" : "primary"}
      />
    </div>
  );
}
