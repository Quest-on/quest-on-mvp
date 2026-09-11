import { execSync } from "child_process";

const MOCK_SERVER_PORT = 4010;

async function globalTeardown() {
  const pid = process.env.__MOCK_SERVER_PID;
  if (pid) {
    console.log(`[global-teardown] Stopping mock server (PID: ${pid})...`);
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Already stopped
    }
  }

  // Fallback: kill any process still listening on the mock server port
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${MOCK_SERVER_PORT}`, {
        encoding: "utf-8",
      }).trim();
      for (const line of out.split("\n")) {
        const portPid = line.trim().split(/\s+/).pop();
        if (portPid && /^\d+$/.test(portPid) && portPid !== "0") {
          console.log(
            `[global-teardown] Killing leftover process on port ${MOCK_SERVER_PORT} (PID: ${portPid})`,
          );
          execSync(`taskkill /F /PID ${portPid}`, { stdio: "pipe" });
        }
      }
    } else {
      const portPid = execSync(`lsof -ti :${MOCK_SERVER_PORT}`, {
        encoding: "utf-8",
      }).trim();
      if (portPid) {
        console.log(
          `[global-teardown] Killing leftover process on port ${MOCK_SERVER_PORT} (PID: ${portPid})`,
        );
        execSync(`kill -9 ${portPid}`, { stdio: "pipe" });
      }
    }
  } catch {
    // No process on port — clean
  }

  console.log("[global-teardown] Done.");
}

export default globalTeardown;
