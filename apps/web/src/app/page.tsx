import { PublicVerification } from "@/components/documents/public-verification";
import { documentText as t } from "@/lib/i18n/documents";

export const metadata = { title: t.verify };

export default function HomePage() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl space-y-8 px-5 py-10 sm:px-8 sm:py-16">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight text-primary sm:text-5xl">
          {t.headline}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">{t.description}</p>
      </header>
      <PublicVerification />
      <details className="border-t border-border pt-5 text-sm text-muted-foreground">
        <summary className="cursor-pointer">{t.limitsTitle}</summary>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-6">
          {t.limits.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </main>
  );
}
