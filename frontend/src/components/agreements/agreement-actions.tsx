"use client";

import { useState } from "react";
import {
  AlertOctagon,
  Ban,
  BadgeCheck,
  Clock,
  Flag,
  Gavel,
  Handshake,
  Info,
  PackageCheck,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { hashFile, hashLink, isValidLink } from "@/lib/deliverable";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/misc";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import {
  ACTIONS,
  actionTarget,
  availableActions,
  defaultRuling,
  waitingMessage,
  type ActionDefinition,
} from "@/lib/lifecycle";
import { formatDateTime, formatEth, shortenAddress } from "@/lib/utils";
import type { Agreement, AgreementAction, Deliverable, Role } from "@/types/agreement";

const ICONS: Record<AgreementAction, LucideIcon> = {
  accept: Handshake,
  start: Play,
  deliver: PackageCheck,
  approve: BadgeCheck,
  dispute: AlertOctagon,
  cancel: Ban,
  cancelOverdue: Clock,
  concedeAsClient: Flag,
  concedeAsFreelancer: Flag,
  resolveDispute: Gavel,
};

const ROLE_LABEL: Record<Role, string> = {
  client: "Client",
  freelancer: "Freelancer",
  observer: "Observer",
};

interface Props {
  agreement: Agreement;
  /** Role derived from the user's identity. */
  actualRole: Role;
  role: Role;
  onRoleChange: (role: Role) => void;
}

export function AgreementActions({ agreement, actualRole, role, onRoleChange }: Props) {
  const { performAction, mode, nowMs } = useAppStore();
  const wallet = useWallet();
  const toast = useToast();
  const [pending, setPending] = useState<ActionDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  // Delivery form (only used by the "deliver" action).
  const [deliveryLink, setDeliveryLink] = useState("");
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const live = mode === "chain";
  // On-chain the role comes from the wallet and cannot be simulated.
  const viewRole: Role = live ? actualRole : role;
  const dispute = agreement.dispute;
  // Demo disputes carry no window: the automatic ruling is available right away.
  const windowElapsed = dispute ? nowMs >= new Date(dispute.windowEndsAt).getTime() : true;

  const actions = availableActions(viewRole, agreement.status, {
    deadlinePassed: nowMs > new Date(agreement.deadline).getTime(),
    disputeWindowElapsed: windowElapsed,
  });
  const actor = viewRole === "freelancer" ? agreement.freelancer.address : agreement.client.address;

  async function confirm() {
    if (!pending) return;
    let deliverable: Deliverable | undefined;
    if (pending.action === "deliver") {
      if (!isValidLink(deliveryLink)) {
        setDeliveryError("Enter a valid link (https:// or ipfs://) to your deliverable.");
        return;
      }
      setDeliveryError(null);
    }
    setLoading(true);
    try {
      if (pending.action === "deliver") {
        const uri = deliveryLink.trim();
        deliverable = { uri, hash: deliveryFile ? await hashFile(deliveryFile) : hashLink(uri) };
      }
      await performAction(agreement.id, pending.action, actor, deliverable);
      toast.success(
        `${ACTIONS[pending.action].label}: done`,
        live ? "Transaction confirmed on the blockchain." : "Status updated. Transaction simulated locally.",
      );
      setPending(null);
    } catch (err) {
      toast.error("Action failed", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const primary = actions.filter((a) => a.tone !== "danger");
  const danger = actions.filter((a) => a.tone === "danger");
  const waiting = waitingMessage(viewRole, agreement.status);

  return (
    <Card>
      <CardHeader title="Actions" description="Available for your role and the current status" />
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {live ? (
          <div className="rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
            <p className="text-xs font-medium text-slate-500">Connected wallet</p>
            <p className="mt-1 font-mono text-xs text-navy-900">
              {wallet.address ? shortenAddress(wallet.address, 6) : "—"}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              You are the <span className="font-medium text-navy-900">{ROLE_LABEL[actualRole].toLowerCase()}</span> on
              this agreement. Switch account in MetaMask to act as another party.
            </p>
            {actualRole === "observer" && (
              <p className="mt-1.5 text-xs text-amber-700">
                This wallet is not a party. Client: {shortenAddress(agreement.client.address, 6)} · Freelancer:{" "}
                {shortenAddress(agreement.freelancer.address, 6)}. Select that account in MetaMask and connect it to
                this site.
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Acting as</p>
            <Segmented
              label="Simulated role"
              value={role}
              onChange={onRoleChange}
              className="w-full [&>button]:flex-1"
              options={[
                { value: "client", label: "Client" },
                { value: "freelancer", label: "Freelancer" },
                { value: "observer", label: "Observer" },
              ]}
            />
            <p className="mt-2 text-xs text-slate-500">
              Your account is the{" "}
              <span className="font-medium text-navy-900">{ROLE_LABEL[actualRole].toLowerCase()}</span> on this
              agreement.
              {role !== actualRole && " You are previewing another role (demo only)."}
            </p>
          </div>
        )}

        {agreement.status === "Disputed" && (
          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 text-sm text-slate-700">
            <p className="font-medium text-rose-700">Dispute open: no arbiter, the contract decides</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-600">
              <li>Either party can concede at any time: the other one wins.</li>
              <li>
                {dispute
                  ? windowElapsed
                    ? "The dispute window is over: anyone can apply the automatic ruling."
                    : `Automatic ruling available from ${formatDateTime(dispute.windowEndsAt)}.`
                  : "After the dispute window, anyone can apply the automatic ruling."}
              </li>
              <li>
                {dispute
                  ? defaultRuling(agreement) === "Completed"
                    ? "Rule: the work was delivered on time, so the freelancer would be paid."
                    : dispute.openedFrom === "Delivered"
                      ? "Rule: the delivery was late, so the client would be refunded."
                      : "Rule: nothing was delivered, so the client would be refunded."
                  : "Rule: the freelancer wins only if the work was delivered on time."}
              </li>
            </ul>
            {dispute && (
              <p className="mt-2 text-[11px] text-slate-500">
                Opened {formatDateTime(dispute.openedAt)} by {shortenAddress(dispute.raisedBy, 5)}.
              </p>
            )}
          </div>
        )}

        {actions.length > 0 ? (
          <div className="space-y-2">
            {primary.map((a) => {
              const Icon = ICONS[a.action];
              return (
                <Button key={a.action} className="w-full justify-start" size="lg" onClick={() => setPending(a)}>
                  <Icon className="size-4" aria-hidden />
                  <span className="flex-1 text-left">{a.label}</span>
                </Button>
              );
            })}
            {danger.map((a) => {
              const Icon = ICONS[a.action];
              return (
                <Button
                  key={a.action}
                  variant="outline"
                  className="w-full justify-start text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                  onClick={() => setPending(a)}
                >
                  <Icon className="size-4" aria-hidden />
                  {a.label}
                </Button>
              );
            })}
          </div>
        ) : null}

        {(waiting || actions.length === 0) && (
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <p>{waiting || "No actions available for this role right now."}</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        onClose={() => !loading && setPending(null)}
        onConfirm={confirm}
        loading={loading}
        title={pending?.confirmTitle ?? ""}
        description={pending?.confirmBody ?? ""}
        confirmLabel={pending?.label ?? "Confirm"}
        tone={pending?.tone}
        icon={
          pending &&
          (() => {
            const Icon = ICONS[pending.action];
            return <Icon className={pending.tone === "danger" ? "text-rose-500" : "text-brand-500"} />;
          })()
        }
      >
        {pending?.action === "deliver" && (
          <div className="mb-4 space-y-4">
            <Field
              label="Link to the deliverable"
              error={deliveryError ?? undefined}
              hint="Where the client can open the work: shared drive, GitHub repository, IPFS…"
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="url"
                  placeholder="https://…"
                  value={deliveryLink}
                  onChange={(e) => setDeliveryLink(e.target.value)}
                  disabled={loading}
                />
              )}
            </Field>
            <Field
              label="File to fingerprint"
              optional
              hint="Its keccak256 hash is stored on-chain, so the client can check they received the exact same file. The file itself is not uploaded."
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="file"
                  onChange={(e) => setDeliveryFile(e.target.files?.[0] ?? null)}
                  disabled={loading}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
                />
              )}
            </Field>
          </div>
        )}
        {pending && (
          <dl className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Agreement</dt>
              <dd className="truncate font-medium text-navy-900">{agreement.id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-medium text-navy-900">{formatEth(agreement.amountEth)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">New status</dt>
              <dd className="font-medium text-navy-900">{actionTarget(pending.action, agreement).replace("InProgress", "In Progress")}</dd>
            </div>
            {live ? (
              <p className="pt-1 text-xs text-slate-500">
                MetaMask will ask you to confirm this transaction on the Hardhat network.
              </p>
            ) : (
              <p className="pt-1 text-xs text-amber-700">Demo mode: the transaction is simulated, no funds move.</p>
            )}
          </dl>
        )}
      </ConfirmDialog>
    </Card>
  );
}
