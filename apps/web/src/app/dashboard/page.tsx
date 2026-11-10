import type { Metadata } from "next";
import { RequireSession } from "@/components/auth/require-session";
import { Dashboard } from "@/components/dashboard/dashboard";
import { ko } from "@/lib/i18n/ko";

export const metadata: Metadata = { title: ko.common.dashboard };

export default function DashboardPage() {
  return (
    <RequireSession>
      <Dashboard />
    </RequireSession>
  );
}
