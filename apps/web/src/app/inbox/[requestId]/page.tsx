import { RequireSession } from "@/components/auth/require-session";
import { Inbox } from "@/components/signatures/inbox";
import { inboxText } from "@/lib/i18n/inbox";

export const metadata = { title: inboxText.title };

export default async function ReviewPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return (
    <RequireSession>
      <Inbox requestId={requestId} />
    </RequireSession>
  );
}
