import type { Metadata } from "next";
import { AgreementsView } from "@/components/agreements/agreements-view";

export const metadata: Metadata = { title: "My Agreements" };

export default function AgreementsPage() {
  return <AgreementsView />;
}
