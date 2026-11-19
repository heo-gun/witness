import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { EmailConfirmation } from "@/components/auth/email-auth-form";
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default function ConfirmEmailPage() {
  return (
    <AuthShell>
      <EmailConfirmation />
    </AuthShell>
  );
}
