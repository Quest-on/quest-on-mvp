import Link from "next/link";
import { Cookie } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function CookiesPage() {
  const t = await getTranslations("legal");

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4 flex items-center gap-2">
          <Cookie className="w-8 h-8" />
          {t("cookies.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("lastModified")}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("cookies.section1.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("cookies.section1.body")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("cookies.section2.heading")}</h2>

        <div className="space-y-4">
          <ul className="list-disc pl-6 space-y-2">
            <li>{t("cookies.section2.item1")}</li>
            <li>{t("cookies.section2.item2")}</li>
            <li>{t("cookies.section2.item3")}</li>
          </ul>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("cookies.section3.heading")}</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-medium mb-2">{t("cookies.section3.essential.heading")}</h3>
            <p>
              {t("cookies.section3.essential.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("cookies.section3.functional.heading")}</h3>
            <p>
              {t("cookies.section3.functional.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("cookies.section3.analytics.heading")}</h3>
            <p>
              {t("cookies.section3.analytics.body")}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("cookies.section4.heading")}</h2>

        <div className="overflow-x-auto">
          <table className="min-w-full border border-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left border border-border">{t("cookies.section4.table.name")}</th>
                <th className="px-4 py-2 text-left border border-border">{t("cookies.section4.table.purpose")}</th>
                <th className="px-4 py-2 text-left border border-border">{t("cookies.section4.table.type")}</th>
                <th className="px-4 py-2 text-left border border-border">{t("cookies.section4.table.retention")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">session</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.session.purpose")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.session.type")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.session.retention")}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">csrf_token</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.csrf.purpose")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.csrf.type")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.csrf.retention")}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">theme</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.theme.purpose")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.theme.type")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.theme.retention")}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 border border-border font-mono text-sm">analytics_id</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.analytics.purpose")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.analytics.type")}</td>
                <td className="px-4 py-2 border border-border">{t("cookies.section4.rows.analytics.retention")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">{t("cookies.section5.heading")}</h2>

        <div className="space-y-4">
          <p>
            {t("cookies.section5.body")}
          </p>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("cookies.section5.browserSettings.heading")}</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Chrome:</strong> {t("cookies.section5.browserSettings.chrome")}
              </li>
              <li>
                <strong>Firefox:</strong> {t("cookies.section5.browserSettings.firefox")}
              </li>
              <li>
                <strong>Safari:</strong> {t("cookies.section5.browserSettings.safari")}
              </li>
              <li>
                <strong>Edge:</strong> {t("cookies.section5.browserSettings.edge")}
              </li>
            </ul>
          </div>

          <div className="bg-info-surface border border-info-border rounded-lg p-4">
            <p className="text-sm">
              <strong>{t("cookies.section5.noteLabel")}</strong> {t("cookies.section5.noteBody")}
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
          <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
            {t("footerLinks.privacy")}
          </Link>
          <span>·</span>
          <Link href="/legal/security" className="hover:text-foreground transition-colors">
            {t("footerLinks.security")}
          </Link>
        </div>
      </footer>
    </article>
  );
}
