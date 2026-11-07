import { notFound } from "next/navigation";
import { SpaceShell } from "@/components/space/space-shell";
import { isRole, ROLES } from "@/lib/profile";

/** Only the two role spaces exist: `/client/...` and `/freelancer/...`. Any other value is a 404 below. */
export function generateStaticParams() {
  return ROLES.map((space) => ({ space }));
}

export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ space: string }>;
}) {
  const { space } = await params;
  if (!isRole(space)) notFound();
  return <SpaceShell role={space}>{children}</SpaceShell>;
}
