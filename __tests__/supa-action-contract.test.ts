/**
 * `/api/supa` 액션 계약. (#344)
 *
 * 클라이언트가 `POST /api/supa {action:"..."}` 로 보내는 액션이 서버 스위치에
 * 없으면 400 `INVALID_ACTION` 이 돌아온다. 그런데 호출부가 그걸 조용히 삼키면
 * 기능이 통째로 죽어도 아무도 모른다.
 *
 * 실제로 그랬다 — `LateEntryWaiting` 의 폴백 폴링이 등록된 적 없는
 * `check_gate_status` 를 15초마다 불렀고, `if (!response.ok) return;` 이 매번
 * 삼켰다. 그 폴링은 Realtime 이 끊겼을 때를 위한 안전망인데, **안전망이 필요한
 * 바로 그 순간에 존재하지 않았다.** 지각 입장한 학생은 승인을 받아도 화면이
 * 넘어가지 않았다.
 *
 * 타입으로는 못 막는다. action 이 문자열이고 스위치가 런타임 분기라서다.
 * 그래서 소스 대조로 고정한다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const SUPA_HANDLER_DIR = join(ROOT, "app", "api", "supa");

/**
 * 주석은 벗기고 본다.
 *
 * 이 가드가 잡아야 하는 건 **실제로 보내는 액션** 이지, 왜 그 액션을 더 이상
 * 쓰지 않기로 했는지 설명하는 문장이 아니다. 주석까지 금지하면 다음 사람이
 * 이유를 모른 채 같은 실수를 반복한다.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** `/api/supa` 로 POST 하는 파일에서 보내는 action 이름을 모은다. */
function collectClientActions(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      // 서버 구현 자체는 호출부가 아니다.
      if (file.startsWith(SUPA_HANDLER_DIR)) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      if (!source.includes("/api/supa")) continue;
      for (const match of source.matchAll(/action:\s*"([a-z0-9_]+)"/g)) {
        const name = match[1];
        const list = found.get(name) ?? [];
        list.push(relative(ROOT, file).replace(/\\/g, "/"));
        found.set(name, list);
      }
    }
  }
  return found;
}

/** `app/api/supa/route.ts` 의 스위치에 등록된 액션 이름을 모은다. */
function collectRegisteredActions(): Set<string> {
  const source = stripComments(readFileSync(join(SUPA_HANDLER_DIR, "route.ts"), "utf8"));
  return new Set([
    ...[...source.matchAll(/case\s+"([a-z0-9_]+)"/g)].map((m) => m[1]),
    ...[...source.matchAll(/^\s*"?([a-z0-9_]+)"?\s*:/gm)].map((m) => m[1]),
  ]);
}

describe("/api/supa 액션 계약", () => {
  const called = collectClientActions();
  const registered = collectRegisteredActions();

  it("스캔이 실제로 호출부를 찾는다", () => {
    // 정규식이 깨져 0건이 되면 이 테스트 전체가 무의미해진다.
    expect(called.size).toBeGreaterThan(5);
    expect(registered.size).toBeGreaterThan(5);
  });

  it("클라이언트가 보내는 액션이 전부 서버에 등록돼 있다", () => {
    const missing = [...called.entries()]
      .filter(([action]) => !registered.has(action))
      .map(([action, files]) => `${action} <- ${files.join(", ")}`);

    expect(missing, `서버에 없는 액션:\n${missing.join("\n")}`).toEqual([]);
  });
});

describe("게이트 상태 폴백 폴링", () => {
  const source = stripComments(
    readFileSync(join(ROOT, "components", "exam", "LateEntryWaiting.tsx"), "utf8")
  );

  it("리소스형 라우트를 부른다", () => {
    // 신규 API 는 /api/supa 액션 스위치가 아니라 리소스형 라우트로만 추가한다(ADR-002).
    expect(source).toMatch(/\/api\/session\/\$\{sessionId\}\/gate/);
    expect(source).not.toContain("check_gate_status");
  });

  it("폴백 라우트가 실제로 존재한다", () => {
    const route = join(ROOT, "app", "api", "session", "[sessionId]", "gate", "route.ts");
    expect(() => statSync(route)).not.toThrow();
    expect(readFileSync(route, "utf8")).toMatch(/export async function GET/);
  });
});
