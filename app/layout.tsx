import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono, Roboto_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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

export const metadata: Metadata = {
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
    <html lang={locale} suppressHydrationWarning={true}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${robotoMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
