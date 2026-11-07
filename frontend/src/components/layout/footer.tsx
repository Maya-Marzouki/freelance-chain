import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create an account" },
    ],
  },
  {
    title: "Platform",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "https://docs.ethers.org/v6/", label: "ethers.js v6", external: true },
      { href: "https://hardhat.org/docs", label: "Hardhat", external: true },
      { href: "https://metamask.io/", label: "MetaMask", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
            Decentralized freelance agreements with escrow and milestone payments on Ethereum.
          </p>
          <p className="mt-4 text-sm font-medium text-navy-900">Work Together. Trust the Blockchain.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-navy-900">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {"external" in l ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-slate-500 transition hover:text-navy-900"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-slate-500 transition hover:text-navy-900">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 FreeLance Chain. Academic blockchain project.</p>
          <p>Connect MetaMask to the local Hardhat network for real transactions; without a wallet the app runs in demo mode.</p>
        </div>
      </div>
    </footer>
  );
}
