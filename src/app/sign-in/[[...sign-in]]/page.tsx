import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function SignInPage() {
  return <AuthShell heading="Welcome back." eyebrow="SECURE WORKSPACE ACCESS">
    <SignIn path="/sign-in" routing="path" fallbackRedirectUrl="/console" signUpUrl="/sign-up" />
  </AuthShell>;
}
