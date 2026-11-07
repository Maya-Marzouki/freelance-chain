"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FilePlus2, Search, SearchX, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { STATUS_META } from "@/components/ui/status-badge";
import { useAppStore } from "@/components/providers/app-store";
import { useScoped } from "@/components/space/use-scoped";
import { useWallet } from "@/components/wallet/wallet-provider";
import { AGREEMENT_STATUSES, type AgreementStatus } from "@/types/agreement";
import { cn } from "@/lib/utils";
import { AgreementsTable, type SortDir, type SortKey } from "./agreements-table";

const PAGE_SIZE = 8;
type Scope = "all" | "client" | "freelancer";

export function AgreementsView() {
  const { roleFor } = useAppStore();
  const { agreements } = useScoped();
  const wallet = useWallet();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AgreementStatus | "all">("all");
  const [scope, setScope] = useState<Scope>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  // Simulates fetching agreements from the contract / indexer.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  const counts = useMemo(() => {
    const c = Object.fromEntries(AGREEMENT_STATUSES.map((s) => [s, 0])) as Record<AgreementStatus, number>;
    agreements.forEach((a) => c[a.status]++);
    return c;
  }, [agreements]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = agreements.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (scope !== "all" && roleFor(a, wallet.address) !== scope) return false;
      if (!q) return true;
      return [a.id, a.title, a.client.name, a.freelancer.name, a.client.address, a.freelancer.address].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      switch (sortKey) {
        case "amount":
          return (a.amountEth - b.amountEth) * dir;
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "status":
          return (AGREEMENT_STATUSES.indexOf(a.status) - AGREEMENT_STATUSES.indexOf(b.status)) * dir;
        case "id":
          return (a.onChainId - b.onChainId) * dir;
        default:
          return a[sortKey].localeCompare(b[sortKey]) * dir;
      }
    });
  }, [agreements, query, status, scope, sortKey, sortDir, roleFor, wallet.address]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "title" || key === "status" ? "asc" : "desc");
    }
    setPage(1);
  }

  const hasFilters = query || status !== "all" || scope !== "all";
  function reset() {
    setQuery("");
    setStatus("all");
    setScope("all");
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="My Agreements"
        description="Track every agreement and its lifecycle status."
        actions={
          <ButtonLink href="/agreements/create">
            <FilePlus2 className="size-4" aria-hidden /> Create Agreement
          </ButtonLink>
        }
      />

      {/* Status filter chips */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2" role="group" aria-label="Filter by status">
          {(["all", ...AGREEMENT_STATUSES] as const).map((s) => {
            const active = status === s;
            const count = s === "all" ? agreements.length : counts[s];
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                  active
                    ? "border-navy-900 bg-navy-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-navy-900",
                )}
              >
                {s !== "all" && <span className={cn("size-1.5 rounded-full", STATUS_META[s].dot)} aria-hidden />}
                {s === "all" ? "All" : STATUS_META[s].label}
                <span className={cn("text-xs", active ? "text-slate-300" : "text-slate-400")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:px-6 lg:flex-row lg:items-center">
          <div className="flex-1 lg:max-w-sm">
            <label htmlFor="agreement-search" className="sr-only">
              Search agreements
            </label>
            <Input
              id="agreement-search"
              type="search"
              placeholder="Search by title, ID, party or address"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              leading={<Search />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
            <Segmented
              label="Filter by role"
              value={scope}
              onChange={(v) => {
                setScope(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All" },
                { value: "client", label: "As client" },
                { value: "freelancer", label: "As freelancer" },
              ]}
            />
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-sm text-slate-500">
                Sort
              </label>
              <Select
                id="sort"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(":") as [SortKey, SortDir];
                  setSortKey(k);
                  setSortDir(d);
                  setPage(1);
                }}
                className="w-44"
              >
                <option value="createdAt:desc">Newest first</option>
                <option value="createdAt:asc">Oldest first</option>
                <option value="deadline:asc">Deadline (soonest)</option>
                <option value="amount:desc">Amount (high → low)</option>
                <option value="amount:asc">Amount (low → high)</option>
                <option value="title:asc">Title (A → Z)</option>
                <option value="status:asc">Status</option>
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100" aria-busy="true" aria-label="Loading agreements">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="hidden h-4 w-28 md:block" />
                <Skeleton className="hidden h-4 w-20 md:block" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={agreements.length ? "No agreements match your filters" : "No agreements yet"}
            description={
              agreements.length
                ? "Try a different search term or clear the filters."
                : "Create your first agreement to get started."
            }
            action={
              hasFilters ? (
                <Button variant="outline" onClick={reset}>
                  <X className="size-4" aria-hidden /> Clear filters
                </Button>
              ) : (
                <ButtonLink href="/agreements/create">Create Agreement</ButtonLink>
              )
            }
          />
        ) : (
          <AgreementsTable agreements={visible} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:px-6">
            <p>
              Showing <span className="font-medium text-navy-900">{(current - 1) * PAGE_SIZE + 1}</span>–
              <span className="font-medium text-navy-900">{Math.min(current * PAGE_SIZE, filtered.length)}</span> of{" "}
              <span className="font-medium text-navy-900">{filtered.length}</span>
            </p>
            <nav aria-label="Pagination" className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(current - 1)}
                disabled={current === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === current ? "page" : undefined}
                  className={cn(
                    "size-8 cursor-pointer rounded-lg text-sm font-medium transition",
                    p === current ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {p}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(current + 1)}
                disabled={current === pageCount}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </nav>
          </div>
        )}
      </Card>
    </>
  );
}
