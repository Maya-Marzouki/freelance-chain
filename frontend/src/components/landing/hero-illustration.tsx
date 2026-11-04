import { BadgeCheck, Blocks, FileSignature, LockKeyhole } from "lucide-react";

/**
 * Illustration of a digital agreement being verified on-chain. Pure markup,
 * no real data.
 */
export function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden>
      {/* soft backdrop */}
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-100/70 via-white to-cyan-100/60 blur-2xl" />

      {/* Agreement document */}
      <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-elevated">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
              <FileSignature className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Agreement #1042</p>
              <p className="text-sm font-semibold text-navy-900">DeFi Dashboard Frontend</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            <span className="size-1.5 rounded-full bg-brand-500" /> In Progress
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {[
            ["Client", "0x5c8a…e21f"],
            ["Freelancer", "0x9b14…07ad"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{k}</p>
              <p className="mt-1 font-mono text-xs text-navy-900">{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2.5">
          {[
            ["Wireframes & architecture", "0.8 ETH", "Released", "bg-emerald-500"],
            ["Core dashboard views", "1.6 ETH", "In review", "bg-amber-500"],
            ["Polish & handover", "1.8 ETH", "Locked", "bg-slate-300"],
          ].map(([t, a, s, c]) => (
            <div key={t} className="flex items-center gap-3 text-sm">
              <span className={`size-2 rounded-full ${c}`} />
              <span className="flex-1 truncate text-slate-700">{t}</span>
              <span className="font-medium text-navy-900">{a}</span>
              <span className="w-16 text-right text-xs text-slate-500">{s}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-brand-500 to-cyan-500" />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>1 of 3 milestones released</span>
          <span className="font-medium text-navy-900">4.2 ETH total</span>
        </div>
      </div>

      {/* Verification card */}
      <div className="absolute -right-3 -bottom-10 w-60 animate-float rounded-2xl border border-slate-200 bg-white p-4 shadow-elevated sm:-right-10">
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-5 text-emerald-500" />
          <p className="text-sm font-semibold text-navy-900">Verified on-chain</p>
        </div>
        <div className="mt-3 space-y-1.5 font-mono text-[11px] text-slate-500">
          <p>block&nbsp;&nbsp;#19,284,551</p>
          <p>tx&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;0x7f3e…c0a9</p>
          <p>terms&nbsp;&nbsp;keccak256 ✓</p>
        </div>
      </div>

      {/* Escrow chip */}
      <div className="absolute -top-5 -left-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card sm:-left-8">
        <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
          <LockKeyhole className="size-4" />
        </div>
        <div>
          <p className="text-[11px] text-slate-500">Escrow locked</p>
          <p className="text-xs font-semibold text-navy-900">3.4 ETH</p>
        </div>
      </div>

      {/* chain blocks */}
      <div className="absolute -bottom-6 left-6 hidden items-center gap-1.5 sm:flex">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-navy-900 text-cyan-400">
              <Blocks className="size-3.5" />
            </div>
            {i < 2 && <div className="h-px w-3 bg-slate-300" />}
          </div>
        ))}
      </div>
    </div>
  );
}
