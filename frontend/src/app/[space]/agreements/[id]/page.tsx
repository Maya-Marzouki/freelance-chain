import { Suspense } from "react";
import type { Metadata } from "next";
import { AgreementDetails } from "@/components/agreements/agreement-details";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Agreement Details" };

export default function AgreementDetailsPage({ params }: PageProps<"/[space]/agreements/[id]">) {
  // `params` is resolved inside the client component, under Suspense, so the
  // rest of the shell can be prerendered.
  return (
    <Suspense
      fallback={
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      }
    >
      <AgreementDetails params={params} />
    </Suspense>
  );
}
