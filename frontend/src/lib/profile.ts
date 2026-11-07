/**
 * Account of the application. The blockchain only knows addresses: the display name and the
 * role chosen at sign-up (client or freelancer) are kept in this browser, indexed by wallet
 * address. This is an app-level choice, not an on-chain permission: the contracts enforce who
 * may do what on each agreement.
 */
export type UserRole = "client" | "freelancer";

export const ROLES: UserRole[] = ["client", "freelancer"];

export interface Profile {
  address: string;
  name: string;
  role: UserRole;
  createdAt: string; // ISO
}

const PROFILES_KEY = "flc:profiles:v1";
const DEMO_KEY = "flc:demo-session:v1";

export const isRole = (value: unknown): value is UserRole => value === "client" || value === "freelancer";

/** Landing page of a role's space. */
export const homeOf = (role: UserRole) => `/${role}/dashboard`;

export function readProfiles(): Record<string, Profile> {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "{}") as Record<string, Profile>;
  } catch {
    return {};
  }
}

export function saveProfile(profile: Profile): Record<string, Profile> {
  const all = { ...readProfiles(), [profile.address.toLowerCase()]: profile };
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: the account only lives for this session */
  }
  return all;
}

/** Demo session (no wallet): remembered for the browser session only. */
export function readDemoRole(): UserRole | null {
  try {
    const value = sessionStorage.getItem(DEMO_KEY);
    return isRole(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDemoRole(role: UserRole | null): void {
  try {
    if (role) sessionStorage.setItem(DEMO_KEY, role);
    else sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* storage unavailable */
  }
}
