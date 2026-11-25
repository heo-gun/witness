import { PublicDocumentDetail } from "@/components/documents/public-document-detail";
import { documentText } from "@/lib/i18n/documents";

export const metadata = { title: documentText.detail };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicDocumentDetail key={id} id={id} />;
}
