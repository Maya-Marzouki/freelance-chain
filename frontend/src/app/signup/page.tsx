import type { Metadata } from "next";
import { AuthView } from "@/components/auth/auth-view";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return <AuthView mode="signup" />;
}
