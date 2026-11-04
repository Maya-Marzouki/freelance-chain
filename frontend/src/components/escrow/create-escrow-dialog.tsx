"use client";

import { useState } from "react";
import { Plus, Trash2, Vault } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { formatEth } from "@/lib/utils";
import type { Agreement } from "@/types/agreement";

const MAX_MILESTONES = 6;
const EPSILON = 1e-9;

interface Row {
  title: string;
  description: string;
  amount: string;
  dueDate: string; // yyyy-mm-dd
}

const isFuture = (dueDate: string) => new Date(`${dueDate}T23:59:59.000Z`).getTime() > Date.now();

function initialRows(agreement: Agreement): Row[] {
  const dueDate = agreement.deadline.slice(0, 10);
  const first = agreement.amountEth / 2;
  return [
    { title: "", description: "", amount: String(first), dueDate },
    { title: "", description: "", amount: String(agreement.amountEth - first), dueDate },
  ];
}

interface Props {
  open: boolean;
  onClose: () => void;
  agreement: Agreement;
}

/** Splits the agreement amount into milestones and creates its escrow on-chain. */
export function CreateEscrowDialog({ open, onClose, agreement }: Props) {
  const { createEscrow } = useAppStore();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => initialRows(agreement));
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remaining = agreement.amountEth - total;
  const rowErrors = rows.map((r) => ({
    title: r.title.trim() ? undefined : "Enter a title.",
    amount: Number(r.amount) > 0 ? undefined : "Enter an amount greater than 0.",
    dueDate: r.dueDate && isFuture(r.dueDate) ? undefined : "Pick a date in the future.",
  }));
  const hasRowError = rowErrors.some((e) => e.title || e.amount || e.dueDate);
  const totalOk = Math.abs(remaining) <= EPSILON;

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit() {
    setSubmitted(true);
    if (hasRowError || !totalOk) return;
    setLoading(true);
    try {
      await createEscrow(
        agreement.id,
        rows.map((r) => ({
          title: r.title.trim(),
          description: r.description.trim(),
          amountEth: Number(r.amount),
          dueDate: r.dueDate,
        })),
      );
      toast.success("Escrow created", "Fund it to start releasing payments milestone by milestone.");
      onClose();
    } catch (err) {
      toast.error("Could not create the escrow", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={loading}
      className="max-w-2xl"
      icon={<Vault className="text-brand-500" />}
      title="Set up escrow"
      description={`Split the ${formatEth(agreement.amountEth)} of ${agreement.id} into milestones. Each one is released only after the freelancer submits it and you approve it.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            {loading ? "Processing…" : "Create escrow"}
          </Button>
        </>
      }
    >
      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-navy-900">Milestone {i + 1}</p>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove milestone ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <Field label="Title" error={submitted ? rowErrors[i].title : undefined}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} aria-describedby={describedBy} invalid={invalid} value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
              )}
            </Field>
            <Field label="Description" optional>
              {({ id }) => <Input id={id} value={r.description} onChange={(e) => update(i, { description: e.target.value })} />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount (ETH)" error={submitted ? rowErrors[i].amount : undefined}>
                {({ id, describedBy, invalid }) => (
                  <Input id={id} aria-describedby={describedBy} invalid={invalid} type="number" min="0" step="any" inputMode="decimal" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
                )}
              </Field>
              <Field label="Due date" error={submitted ? rowErrors[i].dueDate : undefined}>
                {({ id, describedBy, invalid }) => (
                  <Input id={id} aria-describedby={describedBy} invalid={invalid} type="date" value={r.dueDate} onChange={(e) => update(i, { dueDate: e.target.value })} />
                )}
              </Field>
            </div>
          </div>
        ))}

        {rows.length < MAX_MILESTONES && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { title: "", description: "", amount: "0", dueDate: rs[rs.length - 1]?.dueDate ?? "" }])}
          >
            <Plus className="size-4" aria-hidden /> Add milestone
          </Button>
        )}

        <p className={totalOk ? "text-sm text-emerald-700" : submitted ? "text-sm font-medium text-rose-600" : "text-sm text-slate-500"}>
          Total {formatEth(total, 6)} of {formatEth(agreement.amountEth, 6)}
          {totalOk ? " · matches the agreement" : ` · ${remaining > 0 ? `${formatEth(remaining, 6)} left to allocate` : `${formatEth(-remaining, 6)} too much`}`}
        </p>
      </div>
    </Modal>
  );
}
