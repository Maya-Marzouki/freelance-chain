import type { Metadata } from "next";
import { CreateAgreementForm } from "@/components/agreements/create-agreement-form";
import { RoleOnly } from "@/components/space/role-only";

export const metadata: Metadata = { title: "Create Agreement" };

export default function CreateAgreementPage() {
  return (
    <RoleOnly role="client" what="Creating agreements">
      <CreateAgreementForm />
    </RoleOnly>
  );
}
