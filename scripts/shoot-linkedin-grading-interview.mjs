import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

/**
 * Capture the real Quest-On exam detail page and BulkGradingPanel component.
 *
 * Safety boundary:
 * - NODE_ENV=test prevents Next.js from loading .env.local.
 * - Supabase variables point to an unreachable localhost address.
 * - Every browser request under /api/** is fulfilled here; none reaches Next.js.
 * - All non-local browser requests are aborted.
 */

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const assetDir = path.join(
  projectRoot,
  "marketing",
  "linkedin",
  "posts",
  "assets",
  "2026-07-22",
);
const outputPath = path.join(assetDir, "grading-interview-linkedin.png");

const examId = "00000000-0000-4000-8000-000000000722";
const gradingSessionId = "grading-session-linkedin-0722";
const bypassSecret = "queston-local-linkedin-capture";
const captureDate = "2026-07-20T09:00:00.000Z";

const students = [
  {
    sessionId: "session-student-01",
    studentId: "student-01",
    name: "학생 01",
    studentNumber: "20260001",
    email: "student01@example.test",
    submittedAt: "2026-07-18T04:12:00.000Z",
  },
  {
    sessionId: "session-student-02",
    studentId: "student-02",
    name: "학생 02",
    studentNumber: "20260002",
    email: "student02@example.test",
    submittedAt: "2026-07-18T04:18:00.000Z",
  },
  {
    sessionId: "session-student-03",
    studentId: "student-03",
    name: "학생 03",
    studentNumber: "20260003",
    email: "student03@example.test",
    submittedAt: "2026-07-18T04:24:00.000Z",
  },
];

const examPayload = {
  exam: {
    id: examId,
    title: "AI 시대의 문제해결",
    code: "CASE-0722",
    description: "실제 사례를 바탕으로 해결 방안을 제안하는 CASE 시험",
    duration: 60,
    status: "closed",
    created_at: "2026-07-10T00:00:00.000Z",
    open_at: "2026-07-18T03:00:00.000Z",
    close_at: "2026-07-18T05:00:00.000Z",
    started_at: "2026-07-18T03:00:00.000Z",
    deadline: null,
    assignment_prompt: null,
    grades_released: false,
    questions: [
      {
        id: "question-case-01",
        idx: 0,
        type: "case",
        text: "제시된 사례의 핵심 문제를 정의하고 해결 방안을 설명하세요.",
      },
    ],
  },
};

const sessionPayload = {
  sessions: students.map((student) => ({
    id: student.sessionId,
    student_id: student.studentId,
    student_name: student.name,
    student_email: student.email,
    student_number: student.studentNumber,
    status: "submitted",
    submitted_at: student.submittedAt,
    created_at: "2026-07-18T03:02:00.000Z",
  })),
  pagination: {
    page: 1,
    pageSize: 100,
    total: students.length,
    totalPages: 1,
  },
};

const summaryPayload = {
  students: students.map((student) => ({
    ...student,
    status: "submitted",
    submittedAt: student.submittedAt,
    mcq: { correct: 0, total: 0 },
    ox: { correct: 0, total: 0 },
    caseProgress: { submitted: 1, graded: 0, total: 1 },
    overallStatus: "pending",
    bulkGradeStatus: "none",
  })),
};

const bulkGradePayload = {
  session: {
    id: gradingSessionId,
    proposed_grades: {},
    processed_session_ids: {},
    status: "draft",
    committed_at: null,
    updated_at: captureDate,
    grading_scope: "full",
  },
  students,
  studentCount: students.length,
  warning: null,
};

const interviewQuestion =
  "샘플 답안 중 하나는 논리는 탄탄하지만 핵심 개념이 빠져 있습니다.\n이런 답안은 논리 전개와 핵심 개념 중 어느 쪽을 더 중요하게 보시나요?";

const chatPayload = {
  session: {
    id: gradingSessionId,
    status: "draft",
    calibration_status: "interviewing",
  },
  messages: [
    {
      id: "assistant-question-01",
      role: "assistant",
      content: interviewQuestion,
      created_at: captureDate,
    },
  ],
  canStartGrading: false,
  canProceedToGrading: false,
  interviewQuestionCount: 1,
};

const quickReplies = [
  "핵심 개념을 더 중요하게 봅니다",
  "논리 전개를 더 중요하게 봅니다",
  "둘을 비슷하게 봅니다",
];

function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

async function findAvailablePort() {
  const probe = net.createServer();
  probe.unref();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") {
    probe.close();
    throw new Error("Could not allocate a local capture port.");
  }
  const port = address.port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child, logLines) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `Next.js capture server exited with ${child.exitCode}.\n${logLines.slice(-40).join("\n")}`,
      );
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The dev server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for the Next.js capture server.\n${logLines.slice(-40).join("\n")}`);
}

async function stopServer(child) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode == null) child.kill("SIGKILL");
}

fs.mkdirSync(assetDir, { recursive: true });

const port = await findAvailablePort();
const baseURL = `http://127.0.0.1:${port}`;
const serverLogs = [];
const server = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: "test",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_TEST_BYPASS_ENABLED: "true",
    TEST_BYPASS_SECRET: bypassSecret,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-capture-not-used",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverLogs.push(...String(chunk).split(/\r?\n/).filter(Boolean));
    if (serverLogs.length > 200) serverLogs.splice(0, serverLogs.length - 200);
  });
}

let browser;
try {
  await waitForServer(`${baseURL}/sign-in`, server, serverLogs);

  const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE ||
    (fs.existsSync(localChrome) ? localChrome : undefined);
  browser = await chromium.launch(executablePath ? { executablePath } : {});

  const context = await browser.newContext({
    viewport: { width: 1024, height: 396 },
    deviceScaleFactor: 2.0454545454545454,
    colorScheme: "light",
    locale: "ko-KR",
  });

  const testUser = {
    id: "capture-instructor",
    firstName: "Quest-On",
    lastName: "Instructor",
    email: "capture-instructor@example.test",
    unsafeMetadata: { role: "instructor" },
  };

  await context.addCookies([
    { name: "__test_bypass", value: bypassSecret, url: baseURL },
    {
      name: "__test_user",
      value: encodeURIComponent(JSON.stringify(testUser)),
      url: baseURL,
    },
    { name: "__test_user_role", value: "instructor", url: baseURL },
  ]);

  const page = await context.newPage();
  const handledApiRequests = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isLocal = url.origin === baseURL;

    if (!isLocal) {
      await route.abort("blockedbyclient");
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }

    let action = null;
    if (url.pathname === "/api/supa" && request.method() === "POST") {
      try {
        action = request.postDataJSON()?.action ?? null;
      } catch {
        action = null;
      }
    }
    handledApiRequests.push(
      `${request.method()} ${url.pathname}${action ? ` (${action})` : ""}`,
    );

    if (url.pathname === "/api/supa" && action === "get_exam_by_id") {
      await jsonResponse(route, examPayload);
      return;
    }
    if (url.pathname === "/api/supa" && action === "get_folder_contents") {
      await jsonResponse(route, { folders: [], exams: [] });
      return;
    }
    if (url.pathname === `/api/exam/${examId}/sessions`) {
      await jsonResponse(route, sessionPayload);
      return;
    }
    if (url.pathname === `/api/exam/${examId}/student-summaries`) {
      await jsonResponse(route, summaryPayload);
      return;
    }
    if (url.pathname === `/api/exam/${examId}/bulk-grade`) {
      await jsonResponse(route, bulkGradePayload);
      return;
    }
    if (url.pathname === `/api/exam/${examId}/bulk-grade/chat`) {
      await jsonResponse(route, chatPayload);
      return;
    }
    if (url.pathname === `/api/exam/${examId}/bulk-grade/chat-options`) {
      await jsonResponse(route, { success: true, options: quickReplies });
      return;
    }

    await jsonResponse(
      route,
      { message: `Blocked unmocked capture API: ${request.method()} ${url.pathname}` },
      599,
    );
  });

  await page.goto(`${baseURL}/instructor/${examId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "가채점 시작" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "가채점 시작" }).click();

  const panel = page.getByRole("complementary", { name: "CASE AI 가채점" });
  await panel.waitFor({ state: "visible", timeout: 15_000 });
  await page.getByText("핵심 개념을 더 중요하게 봅니다", { exact: true }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.getByPlaceholder("인터뷰 질문에 답변하세요").waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);

  const panelBox = await panel.boundingBox();
  if (!panelBox || Math.abs(panelBox.width - 528) > 0.5 || Math.abs(panelBox.height - 396) > 0.5) {
    throw new Error(`Unexpected product panel size: ${JSON.stringify(panelBox)}`);
  }

  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  if (Math.abs(devicePixelRatio - 2.0454545454545454) > 0.001) {
    throw new Error(`Unexpected devicePixelRatio: ${devicePixelRatio}`);
  }

  await panel.screenshot({
    path: outputPath,
    type: "png",
    animations: "disabled",
  });

  console.error(`Saved actual Quest-On UI screenshot: ${outputPath}`);
  console.error(`Captured actual panel: 528x396 @ 2.04545x = 1080x810`);
  console.error(`Mocked API requests: ${[...new Set(handledApiRequests)].join(", ")}`);
} finally {
  if (browser) await browser.close();
  await stopServer(server);
}
