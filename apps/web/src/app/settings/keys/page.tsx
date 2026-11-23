import type { Metadata } from "next";
import { RequireSession } from "@/components/auth/require-session";
import { PersonalKeys } from "@/components/keys/personal-keys";
import { ko } from "@/lib/i18n/ko";

export const metadata: Metadata = { title: ko.common.myKeys };

export default async function PersonalKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string | string[] }>;
}) {
  const { org } = await searchParams;
  return (
    <RequireSession>
      <PersonalKeys initialSlug={typeof org === "string" ? org : undefined} />
    </RequireSession>
  );
}
