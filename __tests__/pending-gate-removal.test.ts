/**
 * 승인 대기 게이트 제거 회귀 (에픽 #79 / P0).
 *
 * 이건 UX 취향 문제가 아니라 **활성화가 100% 막혀 있던 결함**이다. 교수자가
 * `status:"pending"` 으로 생성되고 미들웨어가 모든 `/instructor` 경로에서
 * `/instructor-pending` 으로 돌려보내서, #147·#164·#166 으로 만든 데모 플로우
 * 전체가 신규 교수자에게 도달 불가였다. 에픽 목표가 "관리자 승인을 기다리지
 * 않고"인데 런타임이 정반대였다.
 *
 * 게이트는 한 곳만 되살아나도 다시 막히므로, 클레임·미들웨어·프로필 생성
 * 세 지점을 함께 고정한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

/** 지정한 경로 아래의 모든 ts/tsx 소스를 [상대경로, 내용] 으로 모은다. */
function collectSources(targets: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (abs: string) => {
    if (statSync(abs).isFile()) {
      if (!/\.tsx?$/.test(abs)) return;
      out.push([
        path.relative(root, abs).replace(/\\/g, "/"),
        readFileSync(abs, "utf8").replace(/\r\n/g, "\n"),
      ]);
      return;
    }
    for (const entry of readdirSync(abs)) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(path.join(abs, entry));
    }
  };
  for (const target of targets) walk(path.join(root, target));
  return out;
}

describe("역할 클레임이 승인 대기를 만들지 않는다", () => {
  const source = read("app/api/user/role/route.ts");

  it("교수자 초기 status 가 approved 다", () => {
    expect(source).toMatch(/instructor:\s*"approved"/);
    expect(source).not.toMatch(/instructor:\s*"pending"/);
  });

  it("ROLE_STATUS 타입에서 pending 이 사라졌다", () => {
    // 타입에 남아 있으면 다음 사람이 "값만 바꾸면 되는" 스위치로 읽는다.
    expect(source).toMatch(/const ROLE_STATUS: Record<SignupRole, "approved">/);
  });
});

describe("미들웨어가 교수자를 승인 대기로 보내지 않는다", () => {
  const source = read("proxy.ts");

  it("instructor-pending 리다이렉트가 없다", () => {
    expect(source).not.toContain("/instructor-pending");
  });

  it("라우트 가드가 pending 을 인가 근거로 쓰지 않는다", () => {
    expect(source).not.toMatch(/isPending/);
    expect(source).not.toMatch(/status === "pending"/);
  });

  it("profiles 조회가 status 를 더 이상 읽지 않는다", () => {
    // 읽어 두면 언젠가 다시 게이트로 쓰인다. 라우팅은 role 만 본다.
    expect(source).toMatch(/\.select\("role"\)/);
    expect(source).not.toMatch(/\.select\("role, status"\)/);
  });

  it("교수자 라우트 가드는 역할만 본다", () => {
    const guard = source.slice(
      source.indexOf("if (isInstructorRoute(pathname))"),
      source.indexOf("if (isStudentRoute(pathname))")
    );
    expect(guard).toContain('role !== "instructor"');
    expect(guard).not.toContain("Pending");
  });
});

describe("승인 대기 화면이 제거됐다", () => {
  it("instructor-pending 페이지가 저장소에 없다", () => {
    // 도달 불가한 막다른 화면을 남겨 두면 다음 사람이 다시 연결한다.
    expect(existsSync(path.join(root, "app/(app)/instructor-pending/page.tsx"))).toBe(false);
  });
});
/**
 * 게이트가 **다른 모양으로 부활**하는 걸 막는다.
 *
 * proxy.ts 문자열만 검사하면 레이아웃·페이지·헬퍼·다른 경로명으로 옮겨 붙는 걸
 * 놓친다. `status` 는 이제 인가 근거가 아니라 비활성 메타데이터이므로, 저장소
 * 어디에서도 허용·거부 분기로 쓰이면 안 된다.
 */
describe("승인 대기가 다른 레이어에서 부활하지 않는다", () => {
  const sources = collectSources([
    "app",
    "components",
    "lib",
    "proxy.ts",
  ]);

  // Clerk 시절 일회성 이관 도구는 우리 `profiles.status` 가 아니라 Clerk 의
  // `unsafe_metadata.status` 를 읽는다. 데이터 소스가 달라 승인 대기 게이트가
  // 아니므로 제외한다. 여기에 뭔가 추가하려면 "왜 게이트가 아닌지"를 적어라.
  const ALLOWED = new Set(["app/api/admin/instructors/migrate/route.ts"]);

  it("status 로 접근을 막는 분기가 없다", () => {
    const offenders: string[] = [];
    for (const [file, source] of sources) {
      if (ALLOWED.has(file)) continue;
      // 타입 선언(`status: "pending" | "approved"`)은 허용. 분기가 문제다.
      const gateLike =
        /(?:user|profile|data|me)\??\.status\s*(?:===|!==)\s*["'](?:pending|approved)["']/.test(source) ||
        /requiresApproval|isAwaitingApproval|needsApproval/.test(source);
      if (gateLike) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("승인 대기 화면으로 보내는 리다이렉트가 없다", () => {
    const offenders = [...sources]
      .filter(([, source]) => /redirect\([^)]*(?:pending|awaiting|verification-required)/i.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

describe("교수자 프로필 생성이 pending 을 박지 않는다", () => {
  it("instructor_profiles 를 approved 로 만든다", () => {
    const source = read("app/api/instructor/profile/route.ts");
    expect(source).toMatch(/status:\s*"approved"/);
    expect(source).not.toMatch(/status:\s*"pending"/);
  });
});

describe("기존 pending 계정 해제 마이그레이션 (021)", () => {
  const sql = read("database/021_clear_pending_status.sql");

  it("원자적이다", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });

  it("profiles 와 instructor_profiles 를 모두 푼다", () => {
    // 한쪽만 풀면 두 테이블이 갈라진 채 남는다.
    expect(sql).toMatch(/UPDATE public\.profiles[\s\S]*?WHERE status = 'pending'/);
    expect(sql).toMatch(/UPDATE public\.instructor_profiles[\s\S]*?WHERE status = 'pending';/);
  });

  it("멱등하다 — 이미 approved 인 행은 건드리지 않는다", () => {
    const updates = sql.match(/WHERE status = 'pending'/g) ?? [];
    expect(updates).toHaveLength(2);
  });

  it("profiles 백필은 교수자 행만 대상으로 한다", () => {
    // 승인 대기는 교수자에게만 있던 개념이다. student·role 미설정 행까지 바꾸면
    // 되돌릴 수 없는 범위 확장이 된다 — 이 마이그레이션은 원래 값을 안 남긴다.
    expect(sql).toMatch(/UPDATE public\.profiles[\s\S]*?AND role = 'instructor';/);
  });

  it("기본값도 approved 로 바꾼다", () => {
    // 기존 행만 풀고 DEFAULT 를 pending 으로 두면 새로 만들어지는 행이 다시 갇힌다.
    expect(sql).toMatch(
      /ALTER TABLE public\.instructor_profiles ALTER COLUMN status SET DEFAULT 'approved';/
    );
  });
});
