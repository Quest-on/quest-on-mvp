/**
 * 유저플로우 검증에서 나온 결함들 (에픽 #79 / G006).
 *
 * 두 독립 플로우 리뷰가 잡은 것 중 실제 사용자를 막거나 거짓말하는 것들이다.
 * 전부 "코드가 맞나"가 아니라 "이 분기를 타면 무슨 일이 벌어지나"를 따라가서
 * 나왔다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("데모 첫 응시가 대기실에 갇히지 않는다 (Critical)", () => {
  const preflight = read("app/api/session/[sessionId]/preflight/route.ts");

  it("preflight 가 데모 미리보기를 판정한다", () => {
    // initExamSession 이 in_progress 로 만든 세션을 preflight 가 waiting 으로
    // 덮어써서, 교수자가 자기 데모 대기실에 갇혔다. 나가려면 다른 탭에서
    // 교수자용 "시험 시작"을 눌러야 하는데 아무도 안내하지 않는다 —
    // 에픽의 핵심 동선이 거기서 끊겼다.
    expect(preflight).toMatch(/isDemoPreview\(\{/);
  });

  it("판정이 in_progress 승격 분기에 들어 있다", () => {
    // 승격 분기 안에 판정이 있어야 한다. 밖에 있으면 대기실 덮어쓰기가 남는다.
    expect(preflight).toMatch(/isDemoPreview\(\{[\s\S]{0,200}?\}\) === true[\s\S]{0,80}?promoteSessionToInProgress/);
  });

  it("같은 순수 함수를 쓴다 — 판정을 복제하지 않는다", () => {
    // 정의가 갈라지면 한쪽만 고쳐졌을 때 이 증상이 그대로 재발한다.
    expect(preflight).toContain('from "@/lib/demo-completion"');
    expect(preflight).not.toMatch(/is_demo === true && \w+\.instructor_id ===/);
  });
});

describe("문구가 지킬 수 없는 약속을 하지 않는다", () => {
  it("학생 한도 안내가 '자리가 열리면'을 약속하지 않는다", () => {
    // 학생 5명은 활성 좌석이 아니라 **누적 distinct 학생 수**다. 기존 학생이
    // 나가도 자리는 열리지 않는다. 열린다고 쓰면 학생이 무한 재시도한다.
    const ko = JSON.parse(read("messages/ko/auth.json"));
    const en = JSON.parse(read("messages/en/auth.json"));
    expect(ko.join.studentLimitReached).not.toMatch(/자리가 열리/);
    expect(en.join.studentLimitReached).not.toMatch(/spot opens|seat opens/i);
  });

  it("코드가 유효하다는 사실은 계속 알린다", () => {
    // 학생 잘못이 아니라는 걸 먼저 말해야 한다.
    const ko = JSON.parse(read("messages/ko/auth.json"));
    expect(ko.join.studentLimitReached).toMatch(/코드는 확인/);
  });

  it("AI 재생성 잠금 문구가 아예 없다", () => {
    // 성공을 약속하고 아무 행동도 못 하게 하는 게 가장 나쁜 조합이다.
    // 그래서 "준비 중" 으로 눌러 뒀었는데, 아예 안 띄우는 쪽으로 갔다 -
    // 기능이 없으면 잠금도 알릴 이유가 없다.
    for (const locale of ["ko", "en"]) {
      const m = JSON.parse(read(`messages/${locale}/instructor.json`));
      const left = Object.keys(m.examDetail ?? {}).filter((k) =>
        k.startsWith("demoAiRegeneration")
      );
      expect(left, `${locale}: 잠금 문구가 남아 있다`).toHaveLength(0);
    }
  });
});

describe("코드 반출 게이트에 우회로가 없다", () => {
  const card = read("components/instructor/ExamDetailsCard.tsx");
  const detail = read("app/(app)/instructor/[examId]/page.tsx");

  it("상세 페이지가 카드에도 게이트 값을 넘긴다", () => {
    // 헤더만 막으면 카드가 그대로 우회로가 된다.
    expect(detail).toMatch(/codeGateBlocked=\{/);
    expect(detail).toMatch(/resolveCodeGate\(/);
  });

  it("차단 상태에서 코드 문자열을 렌더하지 않는다", () => {
    expect(card).toMatch(/codeGateBlocked \? t\("examCode\.blockedTitle"\) : examCode/);
  });

  it("공지문 복사도 같은 게이트를 탄다", () => {
    // 공지문에 코드가 들어간다. 코드 복사만 막으면 여기가 우회로다.
    expect(card).toMatch(/handleCopyNotice = async[\s\S]{0,300}?codeGateBlocked/);
  });
});

describe("fail-open 이 발행 카운트를 새게 하지 않는다", () => {
  const handlers = read("app/api/supa/handlers/session-handlers.ts");

  it("폴백 경로도 first_published_at 을 기록한다", () => {
    // 안 하면 fail-open 으로 들어온 시험이 영영 "미발행"으로 남아 발행
    // 한도가 조용히 샌다 — 장애가 끝난 뒤에도 카운트되지 않는다.
    expect(handlers).toMatch(/quota_fail_open[\s\S]{0,1600}?first_published_at: now/);
  });

  it("데모는 폴백에서도 발행으로 세지 않는다", () => {
    expect(handlers).toMatch(/quota_fail_open[\s\S]{0,1600}?is_demo !== true/);
  });
});

describe("지각 입장 대기가 영구히 갇히지 않는다", () => {
  const waiting = read("components/exam/LateEntryWaiting.tsx");

  it("Realtime 을 놓쳐도 복구하는 폴링이 있다", () => {
    // 구독 전에 승인되거나 연결이 끊기면 서버 타이머는 줄어드는데 화면은
    // "강사 승인 대기 중"에 남는다. 나가는 버튼도 없어 학생이 갇힌다.
    expect(waiting).toMatch(/setInterval\(poll/);
    expect(waiting).toMatch(/check_gate_status/);
  });

  it("폴링이 승인과 거부를 모두 처리한다", () => {
    const poll = waiting.slice(waiting.indexOf("const poll ="), waiting.indexOf("void poll()"));
    expect(poll).toMatch(/in_progress/);
    expect(poll).toMatch(/denied/);
  });
});
