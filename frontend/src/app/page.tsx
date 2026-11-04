import {
  ArrowRight,
  Eye,
  FileCheck2,
  FileSignature,
  Handshake,
  Layers,
  LockKeyhole,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroIllustration } from "@/components/landing/hero-illustration";

const FEATURES = [
  {
    icon: FileSignature,
    title: "Smart Agreements",
    body: "Scope, terms, amount and deadline are hashed and recorded on Ethereum, creating a tamper-proof record both parties sign.",
    tint: "bg-brand-50 text-brand-500",
  },
  {
    icon: LockKeyhole,
    title: "Secure Escrow",
    body: "Client funds are locked in a smart contract when work begins and can only move according to the agreement's rules.",
    tint: "bg-cyan-50 text-cyan-600",
  },
  {
    icon: Layers,
    title: "Milestone Payments",
    body: "Split projects into milestones. Freelancers get paid as each deliverable is approved, not only at the very end.",
    tint: "bg-amber-50 text-amber-600",
  },
  {
    icon: Eye,
    title: "Blockchain Transparency",
    body: "Every lifecycle change emits an on-chain event. Anyone can independently verify an agreement's status and history.",
    tint: "bg-emerald-50 text-emerald-600",
  },
];

const STEPS = [
  { icon: Wallet, title: "Connect your wallet", body: "Sign in with MetaMask. Your address is your identity, no passwords required." },
  { icon: FileSignature, title: "Draft the agreement", body: "Define scope, terms, milestones and the ETH amount, then invite the freelancer." },
  { icon: Handshake, title: "Accept & lock escrow", body: "The freelancer accepts on-chain and the client's funds are secured in escrow." },
  { icon: FileCheck2, title: "Deliver & get paid", body: "Approve deliverables to release milestone payments automatically." },
];

const STATS = [
  { value: "1,280+", label: "Agreements created" },
  { value: "3,450 ETH", label: "Value secured in escrow" },
  { value: "98.6%", label: "Disputes avoided" },
  { value: "< 15s", label: "Average confirmation" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_40%,transparent_100%)] opacity-60"
            aria-hidden
          />
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 pt-14 pb-24 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:pt-20 lg:pb-32">
            <div className="animate-slide-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-sm">
                <ShieldCheck className="size-3.5" aria-hidden />
                Work Together. Trust the Blockchain.
              </span>
              <h1 className="mt-6 text-4xl leading-[1.08] font-semibold tracking-tight text-navy-900 sm:text-5xl lg:text-[3.5rem]">
                Freelance Agreements, <span className="text-brand-500">Secured by Blockchain.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
                FreeLance Chain turns client–freelancer contracts into transparent digital agreements on Ethereum,
                with escrowed funds, milestone payments and a verifiable history of every step.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/dashboard" size="lg">
                  Get Started <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
                <ButtonLink href="#features" size="lg" variant="outline">
                  Explore Features
                </ButtonLink>
              </div>
              <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-500">
                {["Non-custodial", "Ethereum smart contracts", "MetaMask sign-in"].map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-cyan-500" aria-hidden />
                    <dt className="sr-only">Property</dt>
                    <dd>{t}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="px-4 sm:px-10 lg:px-0">
              <HeroIllustration />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-slate-200/70 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-600">Features</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
                Everything a freelance contract needs, enforced by code.
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Replace emails, PDFs and payment chasing with a single shared source of truth.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <article
                  key={f.title}
                  className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <div className={`flex size-11 items-center justify-center rounded-xl ${f.tint}`}>
                    <f.icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-navy-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-brand-600">How it works</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
                From handshake to payout in four steps
              </h2>
            </div>
            <ol className="relative mt-14 grid gap-8 md:grid-cols-4 md:gap-6">
              <div
                className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-gradient-to-r from-brand-200 via-cyan-200 to-brand-200 md:block"
                aria-hidden
              />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex flex-col items-center text-center">
                  <div className="relative flex size-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-brand-500 shadow-card">
                    <s.icon className="size-5" aria-hidden />
                    <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-navy-900 text-[10px] font-semibold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-navy-900">{s.title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Stats */}
        <section id="stats" className="scroll-mt-20 px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-navy-900 px-6 py-14 sm:px-12">
            <div
              className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-brand-500/20 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-cyan-500/15 blur-3xl"
              aria-hidden
            />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_2fr] lg:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Built for trust at every step
                </h2>
                <p className="mt-3 text-sm text-slate-400">Sample figures shown for demonstration purposes.</p>
              </div>
              <dl className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                {STATS.map((s) => (
                  <div key={s.label}>
                    <dt className="text-sm text-slate-400">{s.label}</dt>
                    <dd className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-slate-200/70 bg-white py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-navy-900">Ready to sign your first agreement?</h2>
            <p className="mt-4 text-lg text-slate-600">
              Explore the dashboard with realistic demo data. No funds or deployment required.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/agreements/create" size="lg">
                Create an Agreement
              </ButtonLink>
              <ButtonLink href="/dashboard" size="lg" variant="outline">
                Open Dashboard
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
