/**
 * 발행 한도 게이트 (이슈 #84).
 *
 * 핵심은 **코드 반출 표면을 하나로 수렴시켰는지**다. 표면마다 quota UI 를 따로
 * 붙이면 다음에 생기는 표면에서 반드시 잊힌다 — `is_demo` 제외 필터에서 이미
 * 똑같이 겪었고, 그때 deny-by-default 레지스트리로 막았다. 같은 방식을 쓴다.
 *
 * 막지 못하면 벌어지는 일: 교수자가 네 번째 시험 코드를 수업 자료에 배포한 뒤
 * 수업 중에 학생 전원이 입장 거부를 당한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

/**
 * 시험 코드를 화면에 내보낼 수 있는 파일과 그 사유.
 *
 * **deny-by-default.** 여기 없는 파일이 코드를 렌더하면 테스트가 실패한다.
 * 새 표면을 만들었다면 `ExamCode` 를 쓰거나, 왜 예외인지 여기 적어라.
 */
const CODE_RENDER_REGISTRY: Record<string, string> = {
  "components/instructor/ExamCode.tsx":
    "코드를 내보내는 유일한 컴포넌트. 여기서 한도를 판정한다.",
  "app/(app)/join/page.tsx":
    "학생이 코드를 **입력**하는 화면이다. 교수자에게 반출하는 표면이 아니다.",
  "app/(app)/student/report/[sessionId]/page.tsx":
    "학생이 이미 응시를 마친 뒤 보는 결과지다. 이 코드로 새 학생을 부를 수 없다.",
  "components/instructor/QuickActionsCard.tsx":
    "채점 결과지 안의 시험 식별 표기다. 응시가 끝난 시험이라 발행 한도와 무관하다.",
  "components/landing/DemoExperienceSection.tsx":
    "랜딩의 하드코딩된 예시 화면이다. 실제 시험 코드가 아니다.",
  "components/exam/WaitingRoom.tsx":
    "학생이 이미 입장한 대기실이다. 코드로 새 학생을 부르는 표면이 아니다.",
  "components/exam/LateEntryWaiting.tsx":
    "학생의 지각 입장 대기 화면이다. 이미 입장 판정을 통과한 뒤다.",
  "components/report/ReportCardTemplate.tsx":
    "채점 결과지의 시험 식별 표기다. 응시가 끝난 시험이라 발행 한도와 무관하다.",
  "components/student/StudentDashboardClient.tsx":
    "학생 본인이 응시한 시험 목록이다. 교수자 반출 표면이 아니다.",
  "components/instructor/ExamQuickActionsCard.tsx":
    "응시 종료 후 채점 액션 카드다. 이미 학생을 받은 시험이라 발행 한도와 무관하다.",
  "components/instructor/ExamDetailsCard.tsx":
    "복사 핸들러가 codeGateBlocked 를 먼저 확인하고 막는다. 코드 렌더는 헤더의 ExamCode 가 맡는다.",
  "components/instructor/InstructorHomeClient.tsx":
    "복사 핸들러가 gateBlocked 를 먼저 확인하고 막는다. 코드 렌더는 ExamCard 의 ExamCode 가 맡는다.",
  "app/(app)/instructor/assignment/[assignmentId]/page.tsx":
    "코드 렌더는 ExamCode 로 옮겼다. 남은 writeText 는 그 컴포넌트가 이미 게이트를 통과시킨 코드다.",
};

export function collectSources(dirs: string[]): Array<[string, string]> {
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
  for (const dir of dirs) walk(path.join(root, dir));
  return out;
}

describe("코드 반출 표면이 하나로 수렴한다", () => {
  const sources = collectSources(["app", "components"]);

  it("등록되지 않은 파일이 시험 코드를 렌더하지 않는다", () => {
    const offenders: string[] = [];

    for (const [file, source] of sources) {
      if (CODE_RENDER_REGISTRY[file]) continue;
      // 화면에 코드를 **그리거나** 클립보드에 담는 패턴만 본다.
      //   - `<span>{exam.code}</span>` → 위반
      //   - `clipboard.writeText(exam.code)` → 위반
      //   - `code={exam.code}` → 위반 아님(ExamCode 에 넘기는 것)
      //   - `code: exam.code` → 위반 아님(데이터 전달)
      const rendersRawCode =
        /(?:^|[>\s])\{\s*[\w.?]*\b(?:exam\??\.code|createdExamCode|examCode)\s*\}/m.test(
          source.replace(/\bcode=\{[^}]*\}/g, "")
        ) ||
        /clipboard\.writeText\(\s*[\w.?]*\b(?:code|examCode|createdExamCode)\b/.test(source) ||
        // 삼항으로 코드를 그리는 패턴(`copied ? "복사됨" : exam.code`)도 반출이다.
        /\?[^\n]{0,80}:\s*[\w.?]*\bexam\??\.code\b/.test(source);
      if (rendersRawCode) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it("레지스트리 항목마다 사유가 있다", () => {
    for (const [file, reason] of Object.entries(CODE_RENDER_REGISTRY)) {
      expect(reason.length, `${file} 에 사유가 없다`).toBeGreaterThan(10);
    }
  });
});

describe("한도 게이트 판정", () => {
  it("데모는 어떤 안내도 띄우지 않는다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ isDemo: true, publishesRemaining: 0 })).toBe("open");
  });

  it("이미 발행된 시험에는 발행 한도를 다시 적용하지 않는다", async () => {
    // 재적용하면 한도를 넘긴 교수자의 진행 중인 시험이 수업 도중에 멈춘다.
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ alreadyPublished: true, publishesRemaining: 0 })).toBe("open");
  });

  it("무제한이면 열려 있다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: null })).toBe("open");
  });

  it("한도에 도달하면 차단한다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: 0 })).toBe("blocked");
  });

  it("임박하면 경고한다", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: 1 })).toBe("warning");
  });

  it("여유가 있으면 조용하다 — 상시 카운터는 두지 않는다", async () => {
    // 발행 카운트는 "만든 시험 수"가 아니라 "첫 학생이 들어온 시험 수"라
    // `1/3 사용` 같은 표시는 의미부터 틀리고 첫 경험을 제약 중심으로 만든다.
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate({ publishesRemaining: 3 })).toBe("open");
  });

  it("quota 를 모르면 막지 않는다 — fail-open", async () => {
    const { resolveCodeGate } = await import("../components/instructor/ExamCode");
    expect(resolveCodeGate(undefined)).toBe("open");
    expect(resolveCodeGate({})).toBe("open");
  });
});

describe("차단 상태에서는 코드를 아예 내보내지 않는다", () => {
  const source = read("components/instructor/ExamCode.tsx");

  it("차단이면 코드 문자열과 복사 버튼이 렌더되지 않는다", () => {
    // 보여주고 "쓰지 마세요"라고 적는 건 소용없다 — 이미 복사해 배포한 뒤다.
    const blocked = source.slice(
      source.indexOf('if (gate === "blocked")'),
      source.indexOf("return (\n    <div className={cn(\"space-y-1\"")
    );
    expect(blocked).not.toMatch(/\{code\}/);
    expect(blocked).toMatch(/blockedTitle/);
  });
});

describe("게이트가 실제로 배선돼 있다", () => {
  const drive = read("components/instructor/InstructorHomeClient.tsx");
  const driveHandlers = read("app/api/supa/handlers/drive-handlers.ts");
  const handlers = read("app/api/supa/handlers/session-handlers.ts");
  const sql = read("database/024_admit_exam_session.sql");

  it("드라이브 복사 핸들러가 차단 여부를 실제로 전달받는다", () => {
    // 인자를 안 넘기면 게이트가 있어도 없는 것과 같다. 실제로 그 상태였다.
    expect(drive).toMatch(/handleCopyExamCode\(/);
    expect(drive).toMatch(/resolveCodeGate\(/);
    expect(drive).toMatch(/\}\) === "blocked"/);
  });

  it("드라이브 조회가 판정에 필요한 컬럼을 함께 읽는다", () => {
    // 없으면 alreadyPublished 가 항상 false 라 이미 발행된 시험까지 막힌다.
    expect(driveHandlers).toMatch(/first_published_at/);
  });

  it("세션 생성이 RPC 를 거친다 — 우회 삽입이 없다", () => {
    expect(handlers).toMatch(/"admit_exam_session"/);
    // 정상 경로에 upsert 가 남아 있으면 한도를 통과하지 않고 세션이 생긴다.
    // fail-open 폴백 하나만 허용하고, 그건 quota_fail_open 로그 직후여야 한다.
    const upserts = handlers.match(/\.upsert\(/g) ?? [];
    expect(upserts).toHaveLength(1);
    expect(handlers).toMatch(/quota_fail_open[\s\S]{0,600}?\.upsert\(/);
  });

  it("한도 초과가 학생에게 전용 코드로 전달된다", () => {
    const hook = read("hooks/useExamSession.ts");
    // network_error 로 뭉개면 학생은 새로고침만 반복한다.
    expect(hook).toMatch(/PUBLISH_LIMIT_REACHED: "publish_limit"/);
    expect(hook).toMatch(/STUDENT_LIMIT_REACHED: "student_limit"/);
    // 코드가 보존돼야 "같은 코드로 다시 시도"가 가능하다.
    expect(hook).toMatch(/code=\$\{encodeURIComponent\(examCode\)\}/);
  });

  it("승인이 plan 을 승격한다 (AC-13)", () => {
    const approve = read("app/api/admin/instructors/approve/route.ts");
    // 승인과 plan 승격이 한 트랜잭션이어야 한다. 따로 하면 첫 번째만 성공했을 때
    // instructor_profiles 는 approved 인데 plan 은 free 인 상태가 영구히 남는다.
    expect(approve).toMatch(/approve_instructor/);
    expect(approve).toMatch(/approveError[\s\S]{0,300}?return errorJson\(/);
    expect(sql).toMatch(/plan = 'verified'/);
  });
});

describe("원자적 강제 (024)", () => {
  const sql = read("database/024_admit_exam_session.sql");

  it("교수자 단위로 직렬화한다", () => {
    // count-check-insert 는 TOCTOU 다. 30명이 동시에 들어오면 전부 통과한다.
    // 아직 없는 행은 SELECT FOR UPDATE 로 잠글 수 없다.
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\(v_exam\.instructor_id::text\)\)/);
  });

  it("기존 학생을 기기 지문이 아니라 (exam_id, student_id) 로 판정한다", () => {
    // 지문으로 좁히면 다른 기기로 재접속한 학생이 신규로 분류돼,
    // 정원이 찼을 때 수업 중인 학생이 튕긴다 (AC-10a).
    const block = sql.slice(sql.indexOf("-- 1)"), sql.indexOf("-- 2)"));
    expect(block).toMatch(/s\.exam_id = p_exam_id/);
    expect(block).toMatch(/AND s\.student_id = p_student_id/);
    expect(block).not.toMatch(/device_fingerprint/);
  });

  it("데모는 두 한도와 발행 기록을 모두 우회한다", () => {
    expect(sql).toMatch(/IF NOT COALESCE\(v_exam\.is_demo, false\) THEN/);
  });

  it("이미 발행된 시험에는 발행 한도를 재적용하지 않는다", () => {
    // 재적용하면 한도를 넘긴 교수자의 진행 중인 시험이 수업 도중 멈춘다.
    expect(sql).toMatch(/v_max_publishes IS NOT NULL AND v_exam\.first_published_at IS NULL/);
  });

  it("발행 카운트에서 데모를 뺀다", () => {
    // 빼지 않으면 데모를 만들어 본 교수자가 무료 한도를 한 칸 잃는다.
    expect(sql).toMatch(/e\.is_demo = false/);
  });

  it("권한이 service_role 로 좁혀져 있다", () => {
    expect(sql).toMatch(/FROM anon;/);
    expect(sql).toMatch(/TO service_role;/);
  });

  it("비상 해제 절차가 문서에 있다", () => {
    // 한쪽만 풀면 다른 쪽이 계속 막는다. 캐시 지연도 알아야 한다.
    expect(sql).toMatch(/max_publishes = NULL, max_students = NULL/);
    expect(sql).toMatch(/60초 캐시/);
  });
});

describe("세션 writer 가 저장소 전역에서 하나뿐이다", () => {
  // 이번에 chat·feedback-chat 두 곳을 놓쳤다. 한 파일만 검사하는 감사는
  // 방어선이 아니다 — 새 경로가 생기면 그대로 우회한다.
  const WRITER_REGISTRY: Record<string, string> = {
    "app/api/supa/handlers/session-handlers.ts":
      "admit_exam_session 을 호출하고, RPC 장애 시에만 fail-open 폴백으로 직접 만든다.",
    "app/api/feedback/route.ts":
      "제출 cold-start 도 admit_exam_session 을 거친다. 폴백은 fail-open 계약.",
  };

  it("등록되지 않은 파일이 sessions 행을 만들지 않는다", () => {
    const offenders: string[] = [];
    for (const [file, source] of collectSources(["app", "lib"])) {
      if (WRITER_REGISTRY[file]) continue;
      if (/from\("sessions"\)[\s\S]{0,80}?\.(insert|upsert)\(/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("등록된 writer 는 모두 admission RPC 를 거친다", () => {
    for (const file of Object.keys(WRITER_REGISTRY)) {
      expect(read(file), `${file} 이 RPC 를 안 거친다`).toMatch(/admit_exam_session/);
    }
  });
});

describe("데모 우회가 소유자에게만 열린다 (026)", () => {
  const sql = read("database/026_close_quota_gaps.sql");

  it("소유자 여부를 함께 판정한다", () => {
    // is_demo 만 보면 데모 코드가 무제한 입장권이 된다. 실제로 외부 학생
    // 6명이 전부 통과했다 — 무료 한도의 존재 이유가 사라진다.
    expect(sql).toMatch(/v_owner_preview :=/);
    expect(sql).toMatch(/v_exam\.instructor_id::text = p_student_id/);
  });

  it("소유자가 아니면 한도를 적용한다", () => {
    expect(sql).toMatch(/IF NOT v_owner_preview THEN/);
  });

  it("데모는 여전히 발행 카운트에 안 들어간다", () => {
    // 소유자가 아니어도 데모 자체는 발행으로 세면 안 된다.
    expect(sql).toMatch(/AND NOT COALESCE\(v_exam\.is_demo, false\) THEN/);
  });

  it("승인이 없는 교수자에게 성공을 반환하지 않는다", () => {
    expect(sql).toMatch(/GET DIAGNOSTICS v_updated = ROW_COUNT/);
    expect(sql).toMatch(/IF v_updated = 0 THEN\s*\n\s*RETURN false;/);
  });

  it("SECURITY DEFINER 함수의 PUBLIC 실행권을 회수한다", () => {
    // PostgreSQL 은 함수에 PUBLIC EXECUTE 를 기본으로 준다. anon·authenticated
    // 만 회수하면 나머지 롤이 그대로 실행할 수 있다.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
    expect(sql).toMatch(/p\.prosecdef/);
  });
});
