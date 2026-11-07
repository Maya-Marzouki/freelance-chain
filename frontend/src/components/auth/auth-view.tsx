"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, Laptop, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Logo } from "@/components/layout/logo";
import { useToast } from "@/components/providers/toast-provider";
import { useWallet } from "@/components/wallet/wallet-provider";
import { homeOf, type UserRole } from "@/lib/profile";
import { cn, shortenAddress } from "@/lib/utils";
import { useAuth } from "./auth-provider";

const ROLE_INFO: Record<UserRole, { title: string; text: string; icon: React.ReactNode }> = {
  client: {
    title: "Client",
    text: "I hire freelancers: I create agreements, fund the escrow and approve the work.",
    icon: <Building2 className="size-5" aria-hidden />,
  },
  freelancer: {
    title: "Freelancer",
    text: "I deliver work: I accept agreements, submit milestones and get paid.",
    icon: <Laptop className="size-5" aria-hidden />,
  },
};

const MIN_NAME = 2;
const MAX_NAME = 40;

/** Sign up (choose a role, give a name, link a wallet) and sign in (connect the wallet). */
export function AuthView({ mode }: { mode: "login" | "signup" }) {
  const auth = useAuth();
  const wallet = useWallet();
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const signup = mode === "signup";

  // Signed in (including an automatic reconnection): go straight to the matching space.
  useEffect(() => {
    if (auth.status === "authenticated" && auth.profile) router.replace(homeOf(auth.profile.role));
  }, [auth.status, auth.profile, router]);

  const connected = wallet.status === "connected" && !!wallet.address;
  const nameError = name.trim().length < MIN_NAME || name.trim().length > MAX_NAME ? `Enter ${MIN_NAME} to ${MAX_NAME} characters.` : undefined;

  async function connect() {
    try {
      await wallet.connect();
    } catch (err) {
      toast.error("Connection failed", (err as Error).message);
    }
  }

  function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!role || nameError || !connected) return;
    try {
      const profile = auth.signUp(name, role);
      toast.success("Account created", `Welcome, ${profile.name}. You are in the ${role} space.`);
      router.replace(homeOf(role));
    } catch (err) {
      toast.error("Could not create the account", (err as Error).message);
    }
  }

  function demo(r: UserRole) {
    auth.demoSignIn(r);
    router.replace(homeOf(r));
  }

  const walletBlock = connected ? (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-emerald-700">Wallet connected</p>
        <p className="mt-0.5 font-mono text-sm text-navy-900">{shortenAddress(wallet.address!, 6)}</p>
        {wallet.network && !wallet.network.isSupported && (
          <p className="mt-1 text-xs text-amber-700">Network: {wallet.network.name}. The app targets Hardhat Local.</p>
        )}
      </div>
      {wallet.network && !wallet.network.isSupported ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => wallet.switchNetwork().catch((err: Error) => toast.error("Could not switch network", err.message))}
        >
          Switch network
        </Button>
      ) : (
        <Check className="size-5 text-emerald-600" aria-hidden />
      )}
    </div>
  ) : wallet.status === "unavailable" ? (
    <p className="rounded-xl bg-amber-50 p-3.5 text-sm text-amber-800">
      MetaMask was not detected.{" "}
      <a className="font-medium underline" href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
        Install it
      </a>{" "}
      to create an account, or explore the demo below.
    </p>
  ) : (
    <Button onClick={connect} loading={wallet.status === "connecting"} className="w-full" variant="outline">
      <Wallet className="size-4" aria-hidden /> Connect MetaMask
    </Button>
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <Logo />
      <Card className="mt-8 w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-navy-900">
          {signup ? "Create your account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {signup
            ? "Pick your role: you will get the space built for it. Your wallet is your login, no password."
            : "Connect your wallet: you will land in the space of your role."}
        </p>

        {signup ? (
          <form onSubmit={createAccount} noValidate className="mt-6 space-y-6">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-navy-800">I am a…</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(ROLE_INFO) as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={role === r}
                    onClick={() => setRole(r)}
                    className={cn(
                      "cursor-pointer rounded-xl border p-4 text-left transition",
                      role === r
                        ? "border-brand-400 bg-brand-50/60 ring-4 ring-brand-100"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                      {ROLE_INFO[r].icon} {ROLE_INFO[r].title}
                    </span>
                    <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{ROLE_INFO[r].text}</span>
                  </button>
                ))}
              </div>
              {submitted && !role && <p className="mt-2 text-xs font-medium text-rose-600">Choose a role.</p>}
            </fieldset>

            <Field label="Your name" error={submitted ? nameError : undefined} hint="Shown to the other party.">
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Nora Benali"
                  autoComplete="name"
                />
              )}
            </Field>

            <div>
              <p className="mb-2 text-sm font-medium text-navy-800">Wallet</p>
              {walletBlock}
              {submitted && !connected && <p className="mt-2 text-xs font-medium text-rose-600">Connect your wallet.</p>}
            </div>

            <Button type="submit" size="lg" className="w-full">
              Create account
            </Button>
            <p className="text-center text-sm text-slate-500">
              Already registered?{" "}
              <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
                Sign in
              </Link>
            </p>
          </form>
        ) : (
          <div className="mt-6 space-y-5">
            {walletBlock}
            {auth.status === "unregistered" && (
              <div className="rounded-xl bg-amber-50 p-3.5 text-sm text-amber-800">
                This wallet has no account yet.{" "}
                <Link href="/signup" className="font-medium underline">
                  Create one
                </Link>{" "}
                and pick your role.
              </div>
            )}
            <p className="text-center text-sm text-slate-500">
              New here?{" "}
              <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
                Create an account
              </Link>
            </p>
          </div>
        )}

        <div className="mt-8 border-t border-slate-100 pt-5">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">No wallet? Explore the demo</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="sm" onClick={() => demo("client")}>
              Demo as client
            </Button>
            <Button variant="outline" size="sm" onClick={() => demo("freelancer")}>
              Demo as freelancer
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
