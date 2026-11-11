"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CopyValue } from "@/components/ui/address";
import { hashFile } from "@/lib/deliverable";
import type { Agreement, Role } from "@/types/agreement";

type Check = { name: string; matches: boolean } | null;

/**
 * Shows the deliverable recorded by `markDelivered`: the link to open the work
 * and its on-chain hash. The client can drop the received file to check it is
 * exactly the one the freelancer fingerprinted.
 */
export function DeliverableCard({ agreement, role }: { agreement: Agreement; role: Role }) {
  const [check, setCheck] = useState<Check>(null);
  const [checking, setChecking] = useState(false);
  const deliverable = agreement.deliverable;
  if (!deliverable) return null;

  const reviewing = role === "client" && agreement.status === "Delivered";

  async function verify(file: File | undefined) {
    if (!file || !deliverable) return;
    setChecking(true);
    try {
      const hash = await hashFile(file);
      setCheck({ name: file.name, matches: hash.toLowerCase() === deliverable.hash.toLowerCase() });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Deliverable"
        description={
          reviewing
            ? "Review the work against the terms before approving or raising a dispute."
            : "Submitted by the freelancer, fingerprinted on-chain."
        }
      />
      <CardBody className="space-y-4">
        <a
          href={deliverable.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 break-all text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          {deliverable.uri}
        </a>

        <div>
          <p className="text-xs font-medium text-slate-500">On-chain hash (keccak256)</p>
          <div className="mt-1">
            <CopyValue value={deliverable.hash} chars={6} label="Copy deliverable hash" />
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-3.5">
          <label className="text-xs font-medium text-slate-500" htmlFor={`verify-${agreement.id}`}>
            Check a received file
          </label>
          <input
            id={`verify-${agreement.id}`}
            type="file"
            disabled={checking}
            onChange={(e) => void verify(e.target.files?.[0])}
            className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 file:shadow-sm"
          />
          {check && (
            <p
              className={`mt-2 flex items-start gap-1.5 text-xs ${check.matches ? "text-emerald-700" : "text-rose-600"}`}
              role="status"
            >
              {check.matches ? (
                <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
              ) : (
                <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />
              )}
              {check.matches
                ? `${check.name} matches the hash recorded on-chain.`
                : `${check.name} does not match: it is not the file the freelancer submitted (or only the link was fingerprinted).`}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
