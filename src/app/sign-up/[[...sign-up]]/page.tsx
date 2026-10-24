import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };

export default function SignUpPage() {
  return <AuthShell heading="Start with identity." eyebrow="VEILCALL ACCESS">
    <SignUp path="/sign-up" routing="path" fallbackRedirectUrl="/onboarding" signInUrl="/sign-in" />
  </AuthShell>;
}
