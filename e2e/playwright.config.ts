import { defineConfig } from "@playwright/test";
import path from "path";
import { assertLocalTestEnv } from "./helpers/assert-local-test-env";
import dotenv from "dotenv";

// Load test environment variables.
// override: true — 셸에 남아 있는 값이 .env.test 를 이기면 로컬 스택을
// 띄워 놓고도 엉뚱한 URL·키로 붙는다.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

// DB 안전 멈춤 규칙(AGENTS.md). config 로드 시점에 fail-closed 로 막는다.
// global-setup 보다 먼저 평가되므로 여기가 첫 방어선이다.
assertLocalTestEnv();

const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

const LOCAL_OAUTH_BROWSER_ARGS = [
  "--host-resolver-rules=MAP host.docker.internal 127.0.0.1",
];

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Sequential for browser tests; API tests use per-project override
  fullyParallel: false,

  reporter: process.env.CI
    ? [
        ["list"],
        [
          "junit",
          {
            outputFile: path.resolve(
              __dirname,
              "..",
              process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME ||
                "test-results/results.xml",
            ),
          },
        ],
      ]
    : [["list"], ["html", { open: "never" }]],

  globalSetup: path.resolve(__dirname, "global-setup.ts"),
  globalTeardown: path.resolve(__dirname, "global-teardown.ts"),

  projects: [
    {
      name: "api-integration",
      testDir: "./api",
      fullyParallel: true,
      workers: process.env.CI ? 4 : 2,
      use: {
        baseURL: BASE_URL,
        extraHTTPHeaders: {
          Accept: "application/json",
        },
      },
    },
    {
      name: "browser-e2e",
      testDir: "./browser",
      testIgnore: ["**/flows/**"],
      use: {
        baseURL: BASE_URL,
        browserName: "chromium",
        launchOptions: { args: LOCAL_OAUTH_BROWSER_ARGS },
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
    {
      name: "browser-flows",
      testDir: "./browser/flows",
      use: {
        baseURL: BASE_URL,
        browserName: "chromium",
        launchOptions: { args: LOCAL_OAUTH_BROWSER_ARGS },
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
      },
    },
  ],

  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: "test",
      NEXT_PUBLIC_TEST_BYPASS_ENABLED: "true",
      ...loadEnvTest(),
    },
  },
});

function loadEnvTest(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../.env.test");
  const parsed = dotenv.config({ path: envPath });
  return (parsed.parsed as Record<string, string>) ?? {};
}
