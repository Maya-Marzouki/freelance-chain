"use client";

import { useMemo } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useSpace } from "./space-provider";

/**
 * Data of the current space: a client sees the agreements where they are the client, a
 * freelancer the ones where they are the freelancer (with their milestones, escrows and activity).
 * Outside a space nothing is filtered.
 */
export function useScoped() {
  const { agreements, milestones, escrows, activity, roleFor } = useAppStore();
  const wallet = useWallet();
  const space = useSpace();

  return useMemo(() => {
    if (!space) return { agreements, milestones, escrows, activity };
    const mine = agreements.filter((a) => roleFor(a, wallet.address) === space);
    const ids = new Set(mine.map((a) => a.id));
    return {
      agreements: mine,
      milestones: milestones.filter((m) => ids.has(m.agreementId)),
      escrows: escrows.filter((e) => ids.has(e.agreementId)),
      activity: activity.filter((x) => ids.has(x.agreementId)),
    };
  }, [space, agreements, milestones, escrows, activity, roleFor, wallet.address]);
}
