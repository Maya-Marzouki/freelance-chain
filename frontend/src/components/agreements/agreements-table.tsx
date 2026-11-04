"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { AddressAvatar } from "@/components/ui/address";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn, formatDate, formatEth } from "@/lib/utils";
import type { Agreement, Party } from "@/types/agreement";

export type SortKey = "id" | "title" | "amount" | "createdAt" | "deadline" | "status";
export type SortDir = "asc" | "desc";

interface Props {
  agreements: Agreement[];
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSort?: (key: SortKey) => void;
  /** Reduced column set for the dashboard. */
  compact?: boolean;
}

function PartyCell({ party }: { party: Party }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <AddressAvatar address={party.address} size={24} className="ring-0" />
      <span className="truncate text-sm text-slate-700">{party.name}</span>
    </div>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSort?: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === k;
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
  if (!onSort) {
    return (
      <th scope="col" className={cn("px-4 py-3 text-left font-medium", className)}>
        {label}
      </th>
    );
  }
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={ariaSort} className={cn("px-4 py-3 text-left font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition hover:text-navy-900",
          active && "text-navy-900",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

export function AgreementsTable({ agreements, sortKey, sortDir, onSort, compact }: Props) {
  const sortProps = { sortKey, sortDir, onSort };
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
            <tr>
              <SortHeader label="Agreement" k="title" {...sortProps} className="pl-6" />
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Client
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Freelancer
              </th>
              <SortHeader label="Amount" k="amount" {...sortProps} />
              {!compact && <SortHeader label="Created" k="createdAt" {...sortProps} />}
              <SortHeader label="Deadline" k="deadline" {...sortProps} />
              <SortHeader label="Status" k="status" {...sortProps} />
              <th scope="col" className="px-4 py-3 pr-6 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agreements.map((a) => (
              <tr key={a.id} className="group transition hover:bg-slate-50/70">
                <td className="max-w-[260px] px-4 py-3.5 pl-6">
                  <Link href={`/agreements/${a.id}`} className="block min-w-0 focus-visible:outline-offset-4">
                    <span className="block truncate font-medium text-navy-900 group-hover:text-brand-600">
                      {a.title}
                    </span>
                    <span className="font-mono text-xs text-slate-400">{a.id}</span>
                  </Link>
                </td>
                <td className="max-w-[170px] px-4 py-3.5">
                  <PartyCell party={a.client} />
                </td>
                <td className="max-w-[170px] px-4 py-3.5">
                  <PartyCell party={a.freelancer} />
                </td>
                <td className="px-4 py-3.5 font-medium whitespace-nowrap text-navy-900">{formatEth(a.amountEth)}</td>
                {!compact && <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">{formatDate(a.createdAt)}</td>}
                <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">{formatDate(a.deadline)}</td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-4 py-3.5 pr-6 text-right">
                  <Link
                    href={`/agreements/${a.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 transition hover:bg-brand-50"
                    aria-label={`View details of ${a.title}`}
                  >
                    View <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {agreements.map((a) => (
          <li key={a.id}>
            <Link href={`/agreements/${a.id}`} className="block px-4 py-4 transition hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">{a.title}</p>
                  <p className="font-mono text-xs text-slate-400">{a.id}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span className="truncate">
                  {a.client.name} → {a.freelancer.name}
                </span>
                <span className="ml-3 shrink-0 font-medium text-navy-900">{formatEth(a.amountEth)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Due {formatDate(a.deadline)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
