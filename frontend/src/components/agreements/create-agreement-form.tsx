"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useSpaceRouter } from "@/components/space/use-space-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  FileUp,
  Info,
  Paperclip,
  ShieldCheck,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { PageHeader, SimulatedTag } from "@/components/ui/misc";
import { CopyValue } from "@/components/ui/address";
import { useAppStore } from "@/components/providers/app-store";
import { useToast } from "@/components/providers/toast-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import { hashTerms, isContractDeployed } from "@/lib/ethereum";
import { cn, formatDate, formatEth, formatUsd, isValidAddress, sameAddress, shortenAddress, shortenHash } from "@/lib/utils";
import type { Agreement, CreateAgreementInput } from "@/types/agreement";

interface FormValues {
  title: string;
  clientAddress: string;
  freelancerAddress: string;
  description: string;
  terms: string;
  amount: string;
  deadline: string;
}

type Errors = Partial<Record<keyof FormValues | "document", string>>;

const MAX_FILE_MB = 10;
const ACCEPTED = ".pdf,.doc,.docx,.md,.txt,.png,.jpg";

const noopSubscribe = () => () => {};

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function validate(v: FormValues, today: string): Errors {
  const e: Errors = {};
  if (v.title.trim().length < 5) e.title = "Title must be at least 5 characters.";
  else if (v.title.length > 100) e.title = "Title must be 100 characters or fewer.";
  if (!isValidAddress(v.clientAddress)) e.clientAddress = "Enter a valid Ethereum address (0x followed by 40 hex characters).";
  if (!isValidAddress(v.freelancerAddress))
    e.freelancerAddress = "Enter a valid Ethereum address (0x followed by 40 hex characters).";
  else if (sameAddress(v.clientAddress, v.freelancerAddress))
    e.freelancerAddress = "Client and freelancer must be different wallets.";
  if (v.description.trim().length < 20) e.description = "Describe the project in at least 20 characters.";
  if (v.terms.trim().length < 20) e.terms = "Terms must be at least 20 characters.";
  const amount = Number(v.amount);
  if (!v.amount || Number.isNaN(amount) || amount <= 0) e.amount = "Enter an amount greater than 0.";
  else if (amount > 1000) e.amount = "Amount cannot exceed 1,000 ETH in this demo.";
  else if (!/^\d+(\.\d{1,18})?$/.test(v.amount)) e.amount = "Use at most 18 decimal places.";
  if (!v.deadline) e.deadline = "Choose a deadline.";
  else if (today && v.deadline <= today) e.deadline = "Deadline must be in the future.";
  return e;
}

function Section({
  step,
  title,
  description,
  icon,
  children,
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 [&_svg]:size-[18px]">
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">Step {step}</p>
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <CardBody className="space-y-5">{children}</CardBody>
    </Card>
  );
}

export function CreateAgreementForm() {
  const router = useSpaceRouter();
  const toast = useToast();
  const wallet = useWallet();
  const { user, createAgreement, mode } = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [raw, setRaw] = useState<FormValues>({
    title: "",
    clientAddress: "",
    freelancerAddress: "",
    description: "",
    terms: "",
    amount: "",
    deadline: "",
  });
  // Until the user edits it, the client address follows the connected wallet (or demo account).
  const [clientEdited, setClientEdited] = useState(false);
  const values: FormValues = clientEdited ? raw : { ...raw, clientAddress: wallet.address ?? user.address };
  const [file, setFile] = useState<File | null>(null);
  const [documentError, setDocumentError] = useState<string>();
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  // Client-only date ("" while prerendering) keeps the static shell deterministic.
  const today = useSyncExternalStore(
    noopSubscribe,
    () => toInputDate(new Date()),
    () => "",
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Agreement | null>(null);

  // Errors are derived from the current values; they are shown once a field is touched or the form submitted.
  const errors: Errors = { ...validate(values, today), document: documentError };

  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (key === "clientAddress") setClientEdited(true);
    setRaw((prev) => ({ ...prev, [key]: value }));
  };
  const blur = (key: keyof FormValues) => () => setTouched((t) => ({ ...t, [key]: true }));
  const err = (key: keyof FormValues) => (submitted || touched[key] ? errors[key] : undefined);

  function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setDocumentError(`File must be smaller than ${MAX_FILE_MB} MB.`);
      return;
    }
    setDocumentError(undefined);
    setFile(f);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const result = validate(values, today);
    if (Object.keys(result).length) {
      toast.error("Please fix the highlighted fields", `${Object.keys(result).length} field(s) need attention.`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setReviewOpen(true);
  }

  async function confirmCreate() {
    const input: CreateAgreementInput = {
      title: values.title.trim(),
      clientAddress: values.clientAddress.trim(),
      freelancerAddress: values.freelancerAddress.trim(),
      description: values.description.trim(),
      terms: values.terms.trim(),
      amountEth: Number(values.amount),
      deadline: values.deadline,
      documentName: file?.name,
    };
    setCreating(true);
    try {
      const agreement = await createAgreement(input);
      setReviewOpen(false);
      setCreated(agreement);
      toast.success(
        "Agreement created",
        mode === "chain" ? `${agreement.id} was recorded on the blockchain.` : `${agreement.id} was recorded (simulated).`,
      );
    } catch (error) {
      toast.error("Could not create agreement", (error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const amount = Number(values.amount) || 0;
  const filled = [values.title, values.freelancerAddress, values.description, values.terms, values.amount, values.deadline].filter(
    (x) => x.trim(),
  ).length;

  return (
    <>
      <PageHeader
        title="Create Agreement"
        description="Define the scope, parties and payment. The agreement is signed when the freelancer accepts it."
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Section step={1} title="Project basics" description="What is this agreement about?" icon={<FileText />}>
            <Field label="Agreement title" error={err("title")} hint="A short, descriptive name visible to both parties.">
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={values.title}
                  onChange={set("title")}
                  onBlur={blur("title")}
                  placeholder="e.g. Marketplace smart contract audit"
                  maxLength={100}
                />
              )}
            </Field>
            <Field label="Project description" error={err("description")} hint="Deliverables, scope and acceptance criteria.">
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={values.description}
                  onChange={set("description")}
                  onBlur={blur("description")}
                  placeholder="Describe what will be delivered and how success will be measured…"
                  rows={4}
                />
              )}
            </Field>
          </Section>

          <Section step={2} title="Parties" description="Wallet addresses of the client and the freelancer." icon={<UserRound />}>
            <Field
              label="Client wallet address"
              error={err("clientAddress")}
              hint={wallet.address ? "Prefilled with your connected wallet." : "Prefilled with the demo account."}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={values.clientAddress}
                  onChange={set("clientAddress")}
                  onBlur={blur("clientAddress")}
                  placeholder="0x…"
                  className="font-mono"
                  spellCheck={false}
                  leading={<Wallet />}
                />
              )}
            </Field>
            <Field label="Freelancer wallet address" error={err("freelancerAddress")}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={values.freelancerAddress}
                  onChange={set("freelancerAddress")}
                  onBlur={blur("freelancerAddress")}
                  placeholder="0x…"
                  className="font-mono"
                  spellCheck={false}
                  leading={<Wallet />}
                />
              )}
            </Field>
          </Section>

          <Section step={3} title="Terms & payment" description="Conditions, amount locked in escrow and deadline." icon={<ShieldCheck />}>
            <Field
              label="Terms and conditions"
              error={err("terms")}
              hint="Only the keccak256 hash of the terms will be stored on-chain."
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={values.terms}
                  onChange={set("terms")}
                  onBlur={blur("terms")}
                  placeholder="Payment schedule, revisions, IP ownership, dispute process…"
                  rows={5}
                />
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Contract amount"
                error={err("amount")}
                hint={amount > 0 ? `≈ ${formatUsd(amount)} at mock rate` : "Total value locked in escrow."}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={values.amount}
                    onChange={set("amount")}
                    onBlur={blur("amount")}
                    inputMode="decimal"
                    placeholder="0.00"
                    trailing="ETH"
                  />
                )}
              </Field>
              <Field label="Deadline" error={err("deadline")}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="date"
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={values.deadline}
                    onChange={set("deadline")}
                    onBlur={blur("deadline")}
                    min={today || undefined}
                    leading={<CalendarDays />}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section step={4} title="Supporting document" description="Attach a brief or specification (optional)." icon={<Paperclip />}>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                className="sr-only"
                id="document"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              {file ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-white text-brand-500 shadow-card">
                    <FileText className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy-900">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB · stays in your browser</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    aria-label="Remove document"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="document"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onFile(e.dataTransfer.files?.[0]);
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 px-6 py-8 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <FileUp className="size-6 text-slate-400" aria-hidden />
                  <span className="mt-2 text-sm font-medium text-navy-900">
                    Drop a file or <span className="text-brand-600">browse</span>
                  </span>
                  <span className="mt-1 text-xs text-slate-500">PDF, DOC, MD, TXT or images · up to {MAX_FILE_MB} MB</span>
                </label>
              )}
              {errors.document && <p className="mt-2 text-xs font-medium text-rose-600">{errors.document}</p>}
              <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                In a future release documents will be pinned to IPFS and referenced by hash. For now the file is not uploaded anywhere.
              </p>
            </div>
          </Section>
        </div>

        {/* Review summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Review summary" description={`${filled} of 6 required fields completed`} />
            <CardBody className="space-y-4 text-sm">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-500 transition-[width] duration-300"
                  style={{ width: `${(filled / 6) * 100}%` }}
                />
              </div>
              <dl className="space-y-3">
                <SummaryRow label="Title" value={values.title || "—"} />
                <SummaryRow
                  label="Client"
                  value={isValidAddress(values.clientAddress) ? shortenAddress(values.clientAddress) : "—"}
                  mono
                />
                <SummaryRow
                  label="Freelancer"
                  value={isValidAddress(values.freelancerAddress) ? shortenAddress(values.freelancerAddress) : "—"}
                  mono
                />
                <SummaryRow label="Deadline" value={values.deadline ? formatDate(`${values.deadline}T00:00:00Z`) : "—"} />
                <SummaryRow label="Document" value={file?.name ?? "None"} />
              </dl>
              <div className="rounded-xl bg-navy-900 p-4 text-white">
                <p className="text-xs text-slate-400">Escrow amount</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatEth(amount)}</p>
                <p className="text-xs text-slate-400">≈ {formatUsd(amount)} · locked on acceptance</p>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {isContractDeployed
                  ? "This will send a transaction to the ServiceAgreement contract."
                  : "Demo mode: creation is simulated locally. No transaction is sent and no funds move."}
              </div>
            </CardBody>
            <div className="flex flex-col gap-2 border-t border-slate-100 p-4 sm:px-6">
              <Button type="submit" size="lg" className="w-full">
                Create Agreement <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            </div>
          </Card>
        </aside>
      </form>

      {/* Review / confirm */}
      <ConfirmDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={confirmCreate}
        loading={creating}
        title="Confirm agreement creation"
        description="Review the details below. Once created, the freelancer can accept the agreement."
        confirmLabel="Confirm & Create"
        icon={<ShieldCheck className="text-brand-500" />}
      >
        <dl className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm">
          <SummaryRow label="Title" value={values.title} />
          <SummaryRow label="Freelancer" value={shortenAddress(values.freelancerAddress)} mono />
          <SummaryRow label="Amount" value={formatEth(amount)} />
          <SummaryRow label="Deadline" value={values.deadline ? formatDate(`${values.deadline}T00:00:00Z`) : ""} />
          <SummaryRow label="Terms hash" value={values.terms ? shortenHash(hashTerms(values.terms.trim())) : ""} mono />
        </dl>
        {creating && <p className="mt-3 text-center text-xs text-slate-500">{mode === "chain" ? "Waiting for your confirmation in MetaMask, then for the blockchain…" : "Simulating transaction confirmation…"}</p>}
      </ConfirmDialog>

      {/* Success */}
      <Modal
        open={!!created}
        onClose={() => router.push(created ? `/agreements/${created.id}` : "/agreements")}
        title="Agreement created"
        icon={<CheckCircle2 className="text-emerald-500" />}
        description={
          <>
            <strong className="text-navy-900">{created?.title}</strong> has been created and is waiting for the
            freelancer to accept it.
          </>
        }
        footer={
          <>
            <ButtonLink href="/agreements" variant="outline">
              All agreements
            </ButtonLink>
            <ButtonLink href={created ? `/agreements/${created.id}` : "/agreements"}>View agreement</ButtonLink>
          </>
        }
      >
        {created && (
          <dl className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Agreement ID</dt>
              <dd className="font-mono font-medium text-navy-900">{created.id}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Transaction</dt>
              <dd className="flex items-center gap-2">
                <CopyValue value={created.txHash} chars={6} label="Copy transaction hash" />
                {mode === "demo" && <SimulatedTag />}
              </dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* Cancel */}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => router.push("/agreements")}
        title="Discard this agreement?"
        description="Your changes will be lost."
        confirmLabel="Discard"
        tone="danger"
        icon={<Trash2 className="text-rose-500" />}
      />
    </>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right font-medium text-navy-900", mono && "font-mono text-xs leading-5")}>
        {value}
      </dd>
    </div>
  );
}
