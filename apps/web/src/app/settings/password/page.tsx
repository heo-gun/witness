import { AuthShell } from "@/components/auth/auth-shell";
import { RequireSession } from "@/components/auth/require-session";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
export default function PasswordPage() {
  return (
    <RequireSession>
      <AuthShell>
        <EmailAuthForm mode="change" />
      </AuthShell>
    </RequireSession>
  );
}
