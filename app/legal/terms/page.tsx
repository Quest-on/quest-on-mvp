import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function TermsPage() {
  const t = await getTranslations("legal");

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">{t("terms.title")}</h1>
        <p className="text-muted-foreground">
          {t("lastModified")}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("terms.section1.heading")}</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-medium mb-2">{t("terms.section1.article1.heading")}</h3>
            <p>
              {t("terms.section1.article1.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("terms.section1.article2.heading")}</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("terms.section1.article2.user")}</li>
              <li>{t("terms.section1.article2.content")}</li>
              <li>{t("terms.section1.article2.service")}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("terms.section2.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("terms.section2.body")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">
          {t("terms.section3.heading")}
        </h2>

        <div className="space-y-4">
          <p>
            {t("terms.section3.intro")}
          </p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>{t("terms.section3.item1")}</li>
            <li>{t("terms.section3.item2")}</li>
            <li>{t("terms.section3.item3")}</li>
            <li>{t("terms.section3.item4")}</li>
          </ol>

          <div className="bg-warning-surface border border-warning-border rounded-lg p-4">
            <p className="text-sm">
              <strong>{t("terms.section3.warningLabel")}</strong> {t("terms.section3.warning")}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("terms.section4.heading")}</h2>

        <div className="space-y-4">
          <p>{t("terms.section4.intro")}</p>

          <ul className="list-disc pl-6 space-y-2">
            <li>{t("terms.section4.item1")}</li>
            <li>{t("terms.section4.item2")}</li>
            <li>{t("terms.section4.item3")}</li>
            <li>{t("terms.section4.item4")}</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("terms.section5.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("terms.section5.body")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("terms.section6.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("terms.section6.body")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("terms.section7.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("terms.section7.body")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("terms.section8.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("terms.section8.body")}
          </p>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-border">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
            {t("footerLinks.privacy")}
          </Link>
          <span>·</span>
          <Link href="/legal/security" className="hover:text-foreground transition-colors">
            {t("footerLinks.security")}
          </Link>
          <span>·</span>
          <Link href="/legal/cookies" className="hover:text-foreground transition-colors">
            {t("footerLinks.cookies")}
          </Link>
        </div>
      </footer>
    </article>
  );
}
