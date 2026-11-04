"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AddressAvatar, CopyValue } from "@/components/ui/address";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { HARDHAT_CHAIN_ID, HARDHAT_NETWORK, isContractDeployed } from "@/lib/ethereum";
import { cn } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-navy-900">{children}</dd>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-navy-900">{label}</span>
        <span className="block text-sm text-slate-500">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition",
          checked ? "bg-brand-500" : "bg-slate-200",
        )}
      >
        <span className="sr-only">{label}</span>
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}

export function SettingsView() {
  const wallet = useWallet();
  const { user } = useAppStore();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title ?? "");
  const [prefs, setPrefs] = useState({ status: true, milestones: true, digest: false });

  const statusIcon =
    wallet.status === "connected" ? (
      <CheckCircle2 className="size-4 text-emerald-500" />
    ) : wallet.status === "unavailable" ? (
      <AlertTriangle className="size-4 text-amber-500" />
    ) : (
      <CircleDashed className="size-4 text-slate-400" />
    );

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, wallet connection and notifications." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Wallet & network" description="MetaMask connection used to sign agreements." />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              <Row label="Status">
                <span className="flex items-center gap-1.5 capitalize">
                  {statusIcon}
                  {wallet.status === "unavailable" ? "MetaMask not installed" : wallet.status}
                </span>
              </Row>
              <Row label="Address">
                {wallet.address ? <CopyValue value={wallet.address} chars={6} label="Copy address" /> : "—"}
              </Row>
              <Row label="Active network">
                {wallet.network ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn("size-2 rounded-full", wallet.network.isSupported ? "bg-emerald-500" : "bg-amber-500")}
                    />
                    {wallet.network.name} ({wallet.network.chainId})
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Target network">
                {HARDHAT_NETWORK.chainName} · {HARDHAT_CHAIN_ID}
              </Row>
              <Row label="RPC endpoint">
                <span className="font-mono text-xs">{HARDHAT_NETWORK.rpcUrls[0]}</span>
              </Row>
              <Row label="ServiceAgreement contract">
                {isContractDeployed ? (
                  <span className="text-emerald-600">Deployed</span>
                ) : (
                  <span className="text-amber-600">Not deployed · demo mode</span>
                )}
              </Row>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <ConnectWallet />
              {wallet.status === "connected" && wallet.network && !wallet.network.isSupported && (
                <Button
                  variant="outline"
                  onClick={() =>
                    wallet
                      .switchNetwork()
                      .then(() => toast.success("Switched to Hardhat Local"))
                      .catch((e: Error) => toast.error("Could not switch network", e.message))
                  }
                >
                  Switch to Hardhat
                </Button>
              )}
            </div>
            {wallet.status === "unavailable" && (
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Install MetaMask <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Profile" description="Display information shown to counterparties (demo account)." />
          <CardBody>
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim().length < 2) {
                  toast.error("Name is too short");
                  return;
                }
                toast.success("Profile saved", "Stored for this session only.");
              }}
            >
              <div className="flex items-center gap-4">
                <AddressAvatar address={user.address} size={56} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-900">{name || "—"}</p>
                  <CopyValue value={user.address} chars={6} label="Copy demo address" />
                </div>
              </div>
              <Field label="Display name">
                {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field label="Headline" optional>
                {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
              </Field>
              <Button type="submit">Save profile</Button>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Notifications" description="Choose which events notify you." />
          <CardBody className="divide-y divide-slate-100 py-2">
            <Toggle
              label="Agreement status changes"
              description="Accepted, started, delivered, completed or disputed."
              checked={prefs.status}
              onChange={(v) => setPrefs((p) => ({ ...p, status: v }))}
            />
            <Toggle
              label="Milestone updates"
              description="Submissions awaiting approval and released payments."
              checked={prefs.milestones}
              onChange={(v) => setPrefs((p) => ({ ...p, milestones: v }))}
            />
            <Toggle
              label="Weekly digest"
              description="A summary of activity across all your agreements."
              checked={prefs.digest}
              onChange={(v) => setPrefs((p) => ({ ...p, digest: v }))}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
