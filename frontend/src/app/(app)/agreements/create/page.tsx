import type { Metadata } from "next";
import { CreateAgreementForm } from "@/components/agreements/create-agreement-form";

export const metadata: Metadata = { title: "Create Agreement" };

export default function CreateAgreementPage() {
  return <CreateAgreementForm />;
}
