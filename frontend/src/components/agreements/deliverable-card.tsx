"use client";

import { ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { Agreement, Role } from "@/types/agreement";

/** Shows the link to the work recorded by `markDelivered`, so the client can review it. */
export function DeliverableCard({ agreement, role }: { agreement: Agreement; role: Role }) {
  const deliverable = agreement.deliverable;
  if (!deliverable) return null;

  const reviewing = role === "client" && agreement.status === "Delivered";

  return (
    <Card>
      <CardHeader
        title="Deliverable"
        description={
          reviewing
            ? "Review the work against the terms before approving or raising a dispute."
            : "Link submitted by the freelancer."
        }
      />
      <CardBody>
        <a
          href={deliverable.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 break-all text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          {deliverable.uri}
        </a>
      </CardBody>
    </Card>
  );
}
