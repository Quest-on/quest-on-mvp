import { redirect } from "next/navigation";
import { currentUser } from "@/lib/get-current-user";
import dynamic from "next/dynamic";
import { PublicHeader } from "@/components/PublicHeader";
import HeroSection from "@/components/landing/HeroSection";
import { getTranslations } from "next-intl/server";

// Lazy load below-the-fold components for better performance
const DemoExperienceSection = dynamic(
  () => import("@/components/landing/DemoExperienceSection"),
  { loading: () => <div className="min-h-[600px]" /> }
);
const TestimonialSection = dynamic(
  () => import("@/components/landing/TestimonialSection"),
  { loading: () => <div className="min-h-[600px]" /> }
);
const DeploymentSection = dynamic(
  () => import("@/components/landing/DeploymentSection"),
  { loading: () => <div className="min-h-[400px]" /> }
);
const LogoCloud = dynamic(
  () => import("@/components/landing/LogoCloud"),
  { loading: () => <div className="min-h-[400px]" /> }
);
const Footer = dynamic(
  () => import("@/components/landing/Footer"),
  { loading: () => <div className="min-h-[300px]" /> }
);

export default async function LandingPage() {
  const user = await currentUser();
  const t = await getTranslations("landing");

  if (user) {
    if (!user.role) {
      redirect("/onboarding");
    } else {
      switch (user.role) {
        case "instructor":
          redirect("/instructor");
        case "student":
          redirect("/student");
        default:
          redirect("/student");
      }
    }
  }

  return (
    <div className="min-h-screen surface-page-gradient-soft">
      <PublicHeader />
      {/* Hero Section - AI 사고 과정 추적 */}
      <section id="hero">
        <HeroSection
          headline={
            <>
              <span className="text-strikethrough-bottom text-foreground">
                {t("hero.headline.cheating")}
              </span>
              <span className="text-muted-foreground text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
                {t("hero.headline.cannotStop")}
              </span>{" "}
              <br />
              <span className="gradient-animated-blue">{t("hero.headline.partOf")}</span>
              <span className="text-muted-foreground text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
                {t("hero.headline.makePart")}
              </span>
            </>
          }
          subheadline={
            <>
              {t("hero.subheadline.line1")}
              <br />
              {t("hero.subheadline.line2")}
            </>
          }
        />
      </section>
      {/* Demo Experience Section */}
      {/* TODO: 데모 섹션 잠시 주석처리 */}
      {/* <section id="demo-experience">
        <DemoExperienceSection mode="light" />
      </section> */}
      {/* Features Section - 실시간 평가 시스템 */}
      <section id="features">
        <TestimonialSection mode="light" />
      </section>
      {/* Deployment Section - 실제 강의 현장 트랙션 */}
      <DeploymentSection mode="light" />
      {/* Partners Section - 파트너십 */}
      <LogoCloud mode="light" />
      {/* Footer */}
      <Footer mode="light" />
    </div>
  );
}
