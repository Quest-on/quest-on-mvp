import { execSync } from "child_process";
import { ChildProcess, spawn } from "child_process";
import net from "net";
import path from "path";
import dotenv from "dotenv";
import {
  createTestSupabaseClient,
  waitForTestSupabaseReady,
} from "./helpers/supabase-test-client";
import { assertLocalTestEnv } from "./helpers/assert-local-test-env";

// Load test env vars.
// .env.local 은 절대 읽지 않는다 — 그 파일은 실서비스 자격증명을 담는다.
// override: true — 셸에 남아 있는 값이 .env.test 를 덮어쓰면, 로컬 스택을
// 띄워도 원격 URL 로 붙거나(preflight 가 막지만) 엉뚱한 키를 쓰게 된다.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

// DB 안전 멈춤 규칙(AGENTS.md) 을 여기서 fail-closed 로 강제한다.
// 이 호출이 없으면 .env.test 에 원격 URL 이 들어 있을 때 그대로 원격을 파괴한다.
// 마이그레이션·seed·cleanup 어느 것보다 먼저 실행되어야 한다.
assertLocalTestEnv();

let mockServer: ChildProcess | null = null;

const MOCK_SERVER_PORT = 4010;

/** Check if a port is already in use */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

/** Kill any process listening on the given port */
function killProcessOnPort(port: number): void {
  try {
    if (process.platform === "win32") {
      // lsof 는 Windows 에 없다. netstat + taskkill 로 대체한다.
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf-8",
      }).trim();
      for (const line of out.split("\n")) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== "0") {
          console.log(`[global-setup] Killing process on port ${port} (PID: ${pid})`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: "pipe" });
        }
      }
    } else {
      const pid = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
      if (pid) {
        console.log(`[global-setup] Killing process on port ${port} (PID: ${pid})`);
        execSync(`kill -9 ${pid}`, { stdio: "pipe" });
      }
    }
  } catch {
    // No process on port — that's fine
  }
}

/**
 * Apply pending schema migrations to local Supabase.
 * Uses IF NOT EXISTS so it's safe to run repeatedly.
 */
async function applyMigrations() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("[global-setup] Missing Supabase env vars, skipping migrations");
    return;
  }

  console.log("[global-setup] Applying schema migrations...");
  await waitForTestSupabaseReady();
  const supabase = createTestSupabaseClient();

  const reloadPostgrestSchema = () => {
    for (const container of ["supabase_rest_quest-on-mvp", "supabase_rest_quest-on"]) {
      try {
        execSync(`docker kill --signal=SIGUSR1 ${container}`, { stdio: "pipe" });
        return;
      } catch {
        // Try the next known local Supabase container name.
      }
    }
  };

  // Migration: add chat_weight column if missing (sql/005_add_chat_weight.sql)
  try {
    const { error } = await supabase
      .from("exams")
      .select("chat_weight")
      .limit(0);

    if (error && error.message.includes("does not exist")) {
      console.log("[global-setup] Adding chat_weight column to exams table...");
      if (!process.env.CI) {
        execSync(
          `docker exec -i supabase_db_quest-on-mvp psql -U postgres -d postgres -c "ALTER TABLE exams ADD COLUMN IF NOT EXISTS chat_weight INT DEFAULT 50;"`,
          { stdio: "pipe" }
        );
        console.log("[global-setup] chat_weight column added.");
      } else {
        console.log("[global-setup] CI: skipping docker exec for chat_weight migration.");
      }
    }
  } catch (err) {
    console.warn("[global-setup] chat_weight migration failed:", err);
  }

  // Migration: add score_weights column if missing (database/014_add_score_weights_to_exams.sql)
  try {
    const { error } = await supabase
      .from("exams")
      .select("score_weights")
      .limit(0);

    if (error && error.message.includes("does not exist")) {
      console.log("[global-setup] Adding score_weights column to exams table...");
      if (!process.env.CI) {
        execSync(
          `docker exec -i supabase_db_quest-on-mvp psql -U postgres -d postgres -c "ALTER TABLE exams ADD COLUMN IF NOT EXISTS score_weights JSONB DEFAULT NULL;"`,
          { stdio: "pipe" }
        );
        console.log("[global-setup] score_weights column added.");
      } else {
        console.log("[global-setup] CI: skipping docker exec for score_weights migration.");
      }
    }
  } catch (err) {
    console.warn("[global-setup] score_weights migration failed:", err);
  }

  // Migration: add updated_at column to grades table if missing
  try {
    const { error: gradeColErr } = await supabase
      .from("grades")
      .select("updated_at")
      .limit(0);

    if (gradeColErr && gradeColErr.message.includes("does not exist")) {
      console.log("[global-setup] Adding updated_at column to grades table...");
      if (!process.env.CI) {
        execSync(
          `docker exec -i supabase_db_quest-on-mvp psql -U postgres -d postgres -c "ALTER TABLE grades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;"`,
          { stdio: "pipe" }
        );
        console.log("[global-setup] grades.updated_at column added.");
      } else {
        console.log("[global-setup] CI: skipping docker exec for grades.updated_at migration.");
      }
    }
  } catch (err) {
    console.warn("[global-setup] grades.updated_at migration failed:", err);
  }

  // Migration: idempotent instructor grading chat messages.
  // Always apply when Docker is available: Prisma can create the columns but
  // cannot represent the partial unique indexes this migration needs.
  try {
    console.log("[global-setup] Applying grading chat idempotency migration...");
    if (!process.env.CI) {
      execSync(
        `docker exec -i supabase_db_quest-on-mvp psql -U postgres -d postgres < ${path.resolve(__dirname, "../database/016_chat_message_idempotency.sql")}`,
        { stdio: "pipe" },
      );
      reloadPostgrestSchema();
      console.log("[global-setup] grading chat idempotency migration applied.");
    } else {
      console.log("[global-setup] CI: migration is applied by the test setup action.");
    }
  } catch (err) {
    console.warn("[global-setup] grading chat idempotency migration failed:", err);
  }

  // Migration: ensure submit_exam_atomic RPC exists (sql/006_submit_exam_atomic.sql)
  try {
    const { error: rpcCheckErr } = await supabase.rpc("submit_exam_atomic", {
      p_session_id: "00000000-0000-0000-0000-000000000000",
      p_student_id: "__check__",
      p_exam_id: "00000000-0000-0000-0000-000000000000",
      p_submitted_at: new Date().toISOString(),
      p_compressed_data: "",
      p_compression_metadata: {},
      p_submissions: [],
    });

    // If error is "function does not exist", apply the migration
    if (rpcCheckErr && rpcCheckErr.message.includes("does not exist")) {
      console.log("[global-setup] Applying submit_exam_atomic RPC...");
      if (!process.env.CI) {
        execSync(
          `docker exec -i supabase_db_quest-on-mvp psql -U postgres -d postgres < ${path.resolve(__dirname, "../sql/006_submit_exam_atomic.sql")}`,
          { stdio: "pipe" }
        );
        console.log("[global-setup] submit_exam_atomic RPC applied.");
      } else {
        console.log("[global-setup] CI: skipping docker exec for submit_exam_atomic RPC.");
      }
    }
    // If error is something else (like FK violation), the function exists — that's fine
  } catch (err) {
    console.warn("[global-setup] submit_exam_atomic migration check failed:", err);
  }

  // Migration: ensure create_exam_with_node RPC exists (sql/012_create_exam_with_node.sql)
  try {
    const { error: rpcCheckErr2 } = await supabase.rpc("create_exam_with_node", {
      p_title: "__check__",
      p_code: "__check__",
      p_description: null,
      p_duration: 1,
      p_questions: [],
      p_materials: [],
      p_materials_text: [],
      p_rubric: [],
      p_rubric_public: false,
      p_chat_weight: 50,
      p_status: "draft",
      p_instructor_id: "__check__",
      p_created_at: new Date().toISOString(),
      p_updated_at: new Date().toISOString(),
      p_parent_folder_id: null,
    });

    if (rpcCheckErr2 && rpcCheckErr2.message.includes("does not exist")) {
      console.log("[global-setup] Applying create_exam_with_node RPC...");
      if (!process.env.CI) {
        execSync(
          `docker exec -i supabase_db_quest-on psql -U postgres -d postgres < ${path.resolve(__dirname, "../sql/012_create_exam_with_node.sql")}`,
          { stdio: "pipe" }
        );
        // Reload PostgREST schema cache
        execSync("docker kill --signal=SIGUSR1 supabase_rest_quest-on", { stdio: "pipe" });
        console.log("[global-setup] create_exam_with_node RPC applied.");
      } else {
        console.log("[global-setup] CI: skipping docker exec for create_exam_with_node RPC.");
      }
    } else if (rpcCheckErr2) {
      // Clean up the test row if the function exists but insert failed (expected unique violation)
      // The function exists - that's all we care about
    }
  } catch (err) {
    console.warn("[global-setup] create_exam_with_node migration check failed:", err);
  }

  // Ensure exam-materials storage bucket exists (for upload tests)
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === "exam-materials");

    if (!bucketExists) {
      console.log("[global-setup] Creating exam-materials storage bucket...");
      const { error } = await supabase.storage.createBucket("exam-materials", {
        public: true,
        fileSizeLimit: 26 * 1024 * 1024, // 26MB
      });
      if (error) {
        console.warn("[global-setup] Failed to create bucket:", error.message);
      } else {
        console.log("[global-setup] exam-materials bucket created.");
      }
    }
  } catch (err) {
    console.warn("[global-setup] Bucket setup failed:", err);
  }

  console.log("[global-setup] Migrations complete.");
}

async function globalSetup() {
  // Apply DB migrations first
  await applyMigrations();

  console.log("\n[global-setup] Starting mock server...");

  // Kill any existing process on the mock server port
  if (await isPortInUse(MOCK_SERVER_PORT)) {
    console.log(`[global-setup] Port ${MOCK_SERVER_PORT} is in use, killing existing process...`);
    killProcessOnPort(MOCK_SERVER_PORT);
    // Brief wait for port to free up
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Start the OpenAI mock server
  mockServer = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "scripts/start-mock-server.ts"],
    {
      cwd: path.resolve(__dirname, ".."),
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "test" },
      shell: process.platform === "win32",
    },
  );

  // Wait for mock server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Mock server failed to start within 10s"));
    }, 10_000);

    mockServer!.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("Mock server listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    mockServer!.stderr?.on("data", (data: Buffer) => {
      console.error(`[mock-server stderr] ${data.toString()}`);
    });

    mockServer!.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  console.log("[global-setup] Mock server ready.");

  // Store PID for teardown
  process.env.__MOCK_SERVER_PID = String(mockServer.pid);
}

export default globalSetup;
