import { AuthShell } from "@/components/auth/auth-shell";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <EmailAuthForm mode="verify_email" />
    </AuthShell>
  );
}
