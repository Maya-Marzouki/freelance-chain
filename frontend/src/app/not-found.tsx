import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <div className="mt-10 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <Compass className="size-7" aria-hidden />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-navy-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">The page you are looking for does not exist or has moved.</p>
      <div className="mt-6 flex gap-3">
        <ButtonLink href="/">Go home</ButtonLink>
        <ButtonLink href="/dashboard" variant="outline">
          Open my space
        </ButtonLink>
      </div>
    </main>
  );
}
