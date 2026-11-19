import { AuthShell } from "@/components/auth/auth-shell";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
export default function RecoverPage() {
  return (
    <AuthShell>
      <EmailAuthForm mode="reset_password" />
    </AuthShell>
  );
}
