"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useAppStore } from "@/components/providers/app-store";
import type { ActivityItem, ActivityType } from "@/types/agreement";
import { ACTIVITY_META, ActivityTimeline } from "./activity-timeline";

const FILTERS: { value: ActivityType | "all"; label: string }[] = [
  { value: "all", label: "All events" },
  { value: "AgreementCreated", label: "Agreement Created" },
  { value: "AgreementAccepted", label: "Agreement Accepted" },
  { value: "WorkStarted", label: "Work Started" },
  { value: "DeliverySubmitted", label: "Delivery Submitted" },
  { value: "MilestoneSubmitted", label: "Milestone Submitted" },
  { value: "PaymentReleased", label: "Payment Released" },
  { value: "AgreementCompleted", label: "Agreement Completed" },
  { value: "AgreementCancelled", label: "Agreement Cancelled" },
  { value: "DisputeRaised", label: "Dispute Raised" },
];

const PAGE = 12;

export function ActivityView() {
  const { activity, agreements, mode } = useAppStore();
  const [type, setType] = useState<ActivityType | "all">("all");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => (type === "all" ? activity : activity.filter((a) => a.type === type)), [activity, type]);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const item of filtered.slice(0, limit)) {
      const key = new Date(item.date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [filtered, limit]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    agreements.forEach((a) => {
      m.set(a.client.address, a.client.name);
      m.set(a.freelancer.address, a.freelancer.name);
    });
    return m;
  }, [agreements]);

  return (
    <>
      <PageHeader
        title="Activity History"
        description="Chronological log of every agreement event and its transaction reference."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="activity-type" className="text-sm text-slate-500">
              Event
            </label>
            <Select
              id="activity-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as ActivityType | "all");
                setLimit(PAGE);
              }}
              className="w-52"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(ACTIVITY_META) as ActivityType[])
          .filter((t) => activity.some((a) => a.type === t))
          .map((t) => {
            const meta = ACTIVITY_META[t];
            const Icon = meta.icon;
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
              >
                <Icon className="size-3.5" aria-hidden />
                {meta.label}
                <span className="text-slate-400">{activity.filter((a) => a.type === t).length}</span>
              </span>
            );
          })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<History />} title="No events of this type yet" description="Try another event filter." />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([month, items]) => (
            <section key={month} aria-labelledby={`m-${month}`}>
              <h2 id={`m-${month}`} className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                {month}
              </h2>
              <Card className="px-5 py-6 sm:px-6">
                <ActivityTimeline items={items} showAgreement simulated={mode === "demo"} resolveName={(a) => names.get(a)} />
              </Card>
            </section>
          ))}
          {limit < filtered.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Load more ({filtered.length - limit} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
