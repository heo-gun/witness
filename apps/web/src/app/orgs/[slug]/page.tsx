import type { Metadata } from "next";
import { RequireSession } from "@/components/auth/require-session";
import { OrgDetails } from "@/components/orgs/org-details";
import { ko } from "@/lib/i18n/ko";

export const metadata: Metadata = { title: ko.workspace.eyebrow };

export default async function OrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ slug }, { tab }] = await Promise.all([params, searchParams]);
  return (
    <RequireSession>
      <OrgDetails slug={slug} tab={tab === "settings" ? "settings" : "members"} />
    </RequireSession>
  );
}
