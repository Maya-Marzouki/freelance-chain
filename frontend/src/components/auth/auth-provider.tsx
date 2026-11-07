"use client";

/**
 * Session of the application. Signing in means connecting the wallet: if its address has an
 * account (name + role chosen at sign-up) the user enters the matching space. Without a wallet,
 * a demo session lets anyone explore a space with sample data.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { DEMO_USER } from "@/lib/mock-data";
import { readDemoRole, readProfiles, saveProfile, writeDemoRole, type Profile, type UserRole } from "@/lib/profile";

export type AuthStatus =
  | "loading"
  | "anonymous" // nobody connected
  | "unregistered" // wallet connected but no account yet
  | "authenticated";

interface AuthValue {
  status: AuthStatus;
  profile: Profile | null;
  /** True for a demo session (sample data, no wallet). */
  demo: boolean;
  signUp: (name: string, role: UserRole) => Profile;
  demoSignIn: (role: UserRole) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const [stored, setStored] = useState<{ ready: boolean; profiles: Record<string, Profile>; demoRole: UserRole | null }>({
    ready: false,
    profiles: {},
    demoRole: null,
  });

  // Browser storage is read after mount so the server and first client render agree.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setStored({ ready: true, profiles: readProfiles(), demoRole: readDemoRole() });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const walletProfile =
    wallet.status === "connected" && wallet.address ? stored.profiles[wallet.address.toLowerCase()] : undefined;

  const demoProfile = useMemo<Profile | null>(
    () =>
      stored.demoRole
        ? { address: DEMO_USER.address, name: DEMO_USER.name, role: stored.demoRole, createdAt: new Date(0).toISOString() }
        : null,
    [stored.demoRole],
  );

  const profile = walletProfile ?? demoProfile;
  let status: AuthStatus;
  if (!stored.ready || wallet.status === "initializing" || wallet.status === "connecting") status = "loading";
  else if (profile) status = "authenticated";
  else if (wallet.status === "connected") status = "unregistered";
  else status = "anonymous";

  const signUp = useCallback(
    (name: string, role: UserRole): Profile => {
      if (wallet.status !== "connected" || !wallet.address) throw new Error("Connect your wallet first.");
      if (stored.profiles[wallet.address.toLowerCase()]) throw new Error("This wallet already has an account.");
      const created: Profile = { address: wallet.address, name: name.trim(), role, createdAt: new Date().toISOString() };
      setStored((s) => ({ ...s, profiles: saveProfile(created) }));
      return created;
    },
    [wallet.status, wallet.address, stored.profiles],
  );

  const demoSignIn = useCallback((role: UserRole) => {
    writeDemoRole(role);
    setStored((s) => ({ ...s, demoRole: role }));
  }, []);

  const signOut = useCallback(async () => {
    writeDemoRole(null);
    setStored((s) => ({ ...s, demoRole: null }));
    await wallet.disconnect();
  }, [wallet]);

  const value = useMemo<AuthValue>(
    () => ({ status, profile, demo: !walletProfile && !!demoProfile, signUp, demoSignIn, signOut }),
    [status, profile, walletProfile, demoProfile, signUp, demoSignIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
