import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
  const t = await getTranslations("legal");

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">{t("privacy.title")}</h1>
        <p className="text-muted-foreground">
          {t("lastModified")}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section1.heading")}</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-medium mb-2">{t("privacy.section1.required.heading")}</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>{t("privacy.section1.required.item1Label")}</strong> {t("privacy.section1.required.item1")}
              </li>
              <li>
                <strong>{t("privacy.section1.required.item2Label")}</strong> {t("privacy.section1.required.item2")}
              </li>
              <li>
                <strong>{t("privacy.section1.required.item3Label")}</strong> {t("privacy.section1.required.item3")}
              </li>
              <li>
                <strong>{t("privacy.section1.required.item4Label")}</strong> {t("privacy.section1.required.item4")}
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("privacy.section1.optional.heading")}</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("privacy.section1.optional.item1")}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section2.heading")}</h2>

        <div className="space-y-4">
          <ul className="list-disc pl-6 space-y-2">
            <li>{t("privacy.section2.item1")}</li>
            <li>{t("privacy.section2.item2")}</li>
            <li>{t("privacy.section2.item3")}</li>
            <li>{t("privacy.section2.item4")}</li>
            <li>{t("privacy.section2.item5")}</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section3.heading")}</h2>

        <div className="space-y-4">
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>{t("privacy.section3.item1Label")}</strong> {t("privacy.section3.item1")}
            </li>
            <li>
              <strong>{t("privacy.section3.item2Label")}</strong> {t("privacy.section3.item2")}
            </li>
            <li>
              <strong>{t("privacy.section3.item3Label")}</strong> {t("privacy.section3.item3")}
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            {t("privacy.section3.principle")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section4.heading")}</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-medium mb-2">{t("privacy.section4.thirdParty.heading")}</h3>
            <p>{t("privacy.section4.thirdParty.body")}</p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("privacy.section4.processing.heading")}</h3>
            <p className="mb-2">{t("privacy.section4.processing.body")}</p>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left border border-border">{t("privacy.section4.processing.table.vendor")}</th>
                    <th className="px-4 py-2 text-left border border-border">{t("privacy.section4.processing.table.task")}</th>
                    <th className="px-4 py-2 text-left border border-border">{t("privacy.section4.processing.table.retention")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.cloud.name")}</td>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.cloud.task")}</td>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.cloud.retention")}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.email.name")}</td>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.email.task")}</td>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.email.retention")}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.llm.name")}</td>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.llm.task")}</td>
                    <td className="px-4 py-2 border border-border">{t("privacy.section4.processing.rows.llm.retention")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section5.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("privacy.section5.body")}
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>{t("privacy.section5.country")}</strong> {t("privacy.section5.countryValue")}</li>
            <li><strong>{t("privacy.section5.items")}</strong> {t("privacy.section5.itemsValue")}</li>
            <li><strong>{t("privacy.section5.purpose")}</strong> {t("privacy.section5.purposeValue")}</li>
            <li><strong>{t("privacy.section5.retention")}</strong> {t("privacy.section5.retentionValue")}</li>
            <li><strong>{t("privacy.section5.optOut")}</strong> {t("privacy.section5.optOutValue")}</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section6.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("privacy.section6.body")}
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>{t("privacy.section6.email")}</li>
            <li>{t("privacy.section6.support")}</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            {t("privacy.section6.minor")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section7.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("privacy.section7.body")}
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>{t("privacy.section7.item1")}</li>
            <li>{t("privacy.section7.item2")}</li>
            <li>{t("privacy.section7.item3")}</li>
            <li>{t("privacy.section7.item4")}</li>
            <li>{t("privacy.section7.item5")}</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("privacy.section8.heading")}</h2>

        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-4">
            <p><strong>{t("privacy.section8.officer")}</strong></p>
            <p>{t("privacy.section8.email")}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("privacy.section8.contact")}
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-12 pt-8 border-t border-border">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground transition-colors">
            {t("footerLinks.terms")}
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
