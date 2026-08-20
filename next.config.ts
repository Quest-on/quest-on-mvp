import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { getAppEnv, invalidAppEnvDeclaration } from "./lib/app-env";
import { parseConsentGateMode } from "./lib/consent-gate-mode";

// 오타난 NEXT_PUBLIC_APP_ENV 로 배포하면 스테이징이 프로덕션으로 오인된다(색인 허용,
// 프로덕션 오리진 기본값 적용). 조용히 폴백하지 말고 빌드를 깬다.
const appEnvError = invalidAppEnvDeclaration(process.env.NEXT_PUBLIC_APP_ENV);
if (appEnvError) {
  throw new Error(appEnvError);
}

// Runtime fail-closed alone is too late: a missing mode would let Vercel mark the
// deployment READY and only crash authenticated routes. Reject it during build.
if (process.env.VERCEL === "1") {
  parseConsentGateMode(process.env.CONSENT_GATE_MODE, getAppEnv());
}

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

function localSupabaseConnectSources(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "";

    const websocketProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return ` ${url.origin} ${websocketProtocol}//${url.host}`;
  } catch {
    return "";
  }
}

const localSupabaseSources = localSupabaseConnectSources();

function developmentEvalSource(): string {
  return process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
}

const nextConfig: NextConfig = {
  // Legacy route redirects.
  // /exam/[code]/answer was consolidated into /exam/[code] (PR #12). 308 keeps
  // method + body for any bookmarked or in-flight links.
  async redirects() {
    return [
      {
        source: "/exam/:code/answer",
        destination: "/exam/:code",
        permanent: true,
      },
    ];
  },
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${developmentEvalSource()} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "font-src 'self' data:",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://va.vercel-scripts.com${localSupabaseSources}`,
              "frame-src 'self' https://challenges.cloudflare.com https://www.youtube.com",
              "worker-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compress: true,
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "date-fns",
      "recharts",
      "react-syntax-highlighter",
      "rxjs",
    ],
  },
  // Turbopack 설정 (개발 모드용) — Clerk mock 제거
  turbopack: {
    resolveAlias:
      process.env.NODE_ENV === "test"
        ? {
            "@/lib/supabase-auth": "./lib/testing/supabase-auth-mock.ts",
          }
        : {},
  },
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      return config;
    }

    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        moduleIds: "deterministic",
        runtimeChunk: "single",
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            default: false,
            vendors: false,
            vendor: {
              name: "vendor",
              chunks: "all",
              test: /node_modules/,
              priority: 20,
            },
            radix: {
              name: "radix",
              chunks: "all",
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              priority: 25,
            },
            supabase: {
              name: "supabase",
              chunks: "all",
              test: /[\\/]node_modules[\\/]@supabase[\\/]/,
              priority: 30,
            },
          },
        },
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
