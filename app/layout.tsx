import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono, Roboto_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { EnvBadge } from "@/components/system/EnvBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

/**
 * OG/Twitter 이미지를 절대 URL 로 만들 기준.
 *
 * 없으면 Next 가 경고를 내고 로컬에서는 `http://localhost:PORT` 로 해석한다.
 * Vercel 에서는 `VERCEL_URL` 로 떨어지는데 그건 배포마다 바뀌는 주소라,
 * 공유된 링크의 미리보기 이미지가 옛 배포를 가리키게 된다.
 *
 * 우선순위는 `lib/qstash.ts` 의 getWorkerBaseUrl 과 같은 이유로 같게 둔다:
 *   1. NEXT_PUBLIC_APP_URL — 안정된 정규 도메인. 배포돼도 안 바뀐다
 *   2. VERCEL_URL         — 배포별 주소. 프리뷰에서는 이게 맞다
 *   3. localhost          — 로컬 개발
 */
function resolveMetadataBase(): URL {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return new URL(appUrl);

  const vercel = process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);

  return new URL(`http://localhost:${process.env.PORT ?? 3000}`);
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Quest-On",
  description:
    "Connect instructors and students in an engaging, interactive learning environment",
  icons: {
    icon: "/qlogo_icon.png",
    shortcut: "/qlogo_icon.png",
    apple: "/qlogo_icon.png",
  },
  openGraph: {
    title: "Quest-On",
    description:
      "Connect instructors and students in an engaging, interactive learning environment",
    images: [
      {
        url: "/qstn_og.png",
        width: 1200,
        height: 630,
        alt: "Quest-On",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quest-On",
    description:
      "Connect instructors and students in an engaging, interactive learning environment",
    images: ["/qstn_og.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning on <html> is required by next-themes (class/style injection)
    // data-scroll-behavior 는 globals.css 의 `html { scroll-behavior: smooth }`
    // 와 짝이다. 이 표시가 없으면 라우트 전환 때 Next 의 스크롤 복원이
    // 애니메이션으로 처리돼 페이지가 스르륵 움직인다. 개발 서버가 경고로
    // 알려준다.
    <html
      lang={locale}
      suppressHydrationWarning={true}
      data-scroll-behavior="smooth"
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${robotoMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <EnvBadge />
        <SpeedInsights />
      </body>
    </html>
  );
}
