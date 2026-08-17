import Link from "next/link";
import { ShieldCheck, Lock, Eye, Database, AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function SecurityPage() {
  const t = await getTranslations("legal");

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">{t("security.title")}</h1>
        <p className="text-muted-foreground">
          {t("security.subtitle")}
        </p>
      </header>

      <section className="mb-12">
        <div className="bg-info-surface border border-info-border rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
            {t("security.principles.heading")}
          </h2>
          <p>
            {t("security.principles.body")}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-6 h-6" />
          {t("security.technical.heading")}
        </h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.technical.encryption.heading")}</h3>
            <p>
              {t("security.technical.encryption.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.technical.storageEncryption.heading")}</h3>
            <p>
              {t("security.technical.storageEncryption.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.technical.accessControl.heading")}</h3>
            <p>
              {t("security.technical.accessControl.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.technical.session.heading")}</h3>
            <p>
              {t("security.technical.session.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.technical.logging.heading")}</h3>
            <p>
              {t("security.technical.logging.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.technical.backup.heading")}</h3>
            <p>
              {t("security.technical.backup.body")}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Database className="w-6 h-6" />
          {t("security.operational.heading")}
        </h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.operational.personnel.heading")}</h3>
            <p>
              {t("security.operational.personnel.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.operational.vulnerability.heading")}</h3>
            <p>
              {t("security.operational.vulnerability.body")}
            </p>
          </div>

          <div>
            <h3 className="text-xl font-medium mb-2">{t("security.operational.incident.heading")}</h3>
            <p>
              {t("security.operational.incident.body")}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" />
          {t("security.reporting.heading")}
        </h2>

        <div className="space-y-4">
          <p>
            {t("security.reporting.body")}
          </p>
          <div className="bg-muted rounded-lg p-4">
            <p><strong>{t("security.reporting.email")}</strong></p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("security.reporting.process")}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("security.reporting.disclosure")}
          </p>
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
          <Link href="/legal/cookies" className="hover:text-foreground transition-colors">
            {t("footerLinks.cookies")}
          </Link>
        </div>
      </footer>
    </article>
  );
}
