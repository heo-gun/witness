import { InvitationPage } from "@/components/dashboard/invitation-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvitationPage id={id} />;
}
