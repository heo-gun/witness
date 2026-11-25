import { RequireSession } from "@/components/auth/require-session";
import { Inbox } from "@/components/signatures/inbox";
import { inboxText } from "@/lib/i18n/inbox";

export const metadata = { title: inboxText.title };

export default function InboxPage() {
  return (
    <RequireSession>
      <Inbox />
    </RequireSession>
  );
}
