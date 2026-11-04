"use client";

import { useState } from "react";
import {
  AlertOctagon,
  Ban,
  BadgeCheck,
  Clock,
  Gavel,
  Handshake,
  Info,
  PackageCheck,
  Play,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/misc";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import { ACTIONS, availableActions, waitingMessage, type ActionDefinition } from "@/lib/lifecycle";
import { MOCK_NOW, mockAddress } from "@/lib/mock-data";
import { formatEth, sameAddress, shortenAddress } from "@/lib/utils";
import type { Agreement, AgreementAction, Role, ViewRole } from "@/types/agreement";

const ICONS: Record<AgreementAction, LucideIcon> = {
  accept: Handshake,
  start: Play,
  deliver: PackageCheck,
  approve: BadgeCheck,
  dispute: AlertOctagon,
  cancel: Ban,
  cancelOverdue: Clock,
  resolveForFreelancer: Gavel,
  resolveForClient: Scale,
};

const ROLE_LABEL: Record<ViewRole, string> = {
  client: "Client",
  freelancer: "Freelancer",
  observer: "Observer",
  arbiter: "Arbiter",
};

/** Placeholder address for the simulated arbiter in demo mode. */
const DEMO_ARBITER = mockAddress("arbiter");

interface Props {
  agreement: Agreement;
  /** Role derived from the user's identity. */
  actualRole: Role;
  role: ViewRole;
  onRoleChange: (role: ViewRole) => void;
}

export function AgreementActions({ agreement, actualRole, role, onRoleChange }: Props) {
  const { performAction, mode, arbiterAddress } = useAppStore();
  const wallet = useWallet();
  const toast = useToast();
  const [pending, setPending] = useState<ActionDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [now] = useState(() => (mode === "chain" ? Date.now() : new Date(MOCK_NOW).getTime()));

  const live = mode === "chain";
  // On-chain the role comes from the wallet and cannot be simulated.
  const viewRole: ViewRole = live ? actualRole : role;
  const isArbiter = live ? sameAddress(wallet.address, arbiterAddress) : viewRole === "arbiter";
  const lifecycleRole: Role = viewRole === "arbiter" ? "observer" : viewRole;

  const actions = availableActions(lifecycleRole, agreement.status, {
    deadlinePassed: now > new Date(agreement.deadline).getTime(),
    isArbiter,
  });
  const actor =
    viewRole === "arbiter"
      ? DEMO_ARBITER
      : viewRole === "client"
        ? agreement.client.address
        : agreement.freelancer.address;

  async function confirm() {
    if (!pending) return;
    setLoading(true);
    try {
      await performAction(agreement.id, pending.action, actor);
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
  const waiting = waitingMessage(lifecycleRole, agreement.status, isArbiter);

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
              You are the{" "}
              <span className="font-medium text-navy-900">
                {[ROLE_LABEL[actualRole].toLowerCase(), isArbiter ? "arbiter" : null]
                  .filter((r) => r && r !== "observer")
                  .join(" and ") || "observer"}
              </span>{" "}
              on this agreement. Switch account in MetaMask to act as another party.
            </p>
            {actualRole === "observer" && !isArbiter && (
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
                { value: "arbiter", label: "Arbiter" },
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
              <dd className="font-medium text-navy-900">{pending.to.replace("InProgress", "In Progress")}</dd>
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
