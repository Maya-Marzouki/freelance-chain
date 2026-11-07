import type { Metadata } from "next";
import { EscrowView } from "@/components/escrow/escrow-view";

export const metadata: Metadata = { title: "Escrow & Milestones" };

export default function EscrowPage() {
  return <EscrowView />;
}
