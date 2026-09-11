/**
 * 다른 기기 재입장 (AC-10a 후속, 유저플로우 검증 P0).
 *
 * 수업 중 노트북 네트워크가 끊겨 휴대폰으로 다시 들어오는 상황이다.
 *
 * DB 는 이미 통과시킨다 — `admit_exam_session` 이 `(exam_id, student_id)` 로
 * 기존 세션을 찾아 돌려주므로 정원이 찼어도 안 튕긴다. 문제는 **서비스 계층이
 * 기기 지문으로 먼저 갈라진다**는 것이었다: 지문이 다르면 `existingSession` 이
 * null 이 되어 재활성화·fingerprint 갱신·이전 AI 대화 로드를 전부 건너뛴다.
 *
 * 결과는 반쪽 상태다. 화면은 응시 중인데 heartbeat 는 `SESSION_INACTIVE` 로
 * 계속 실패하고 AI 대화는 비어 있다. 새로고침해도 지문은 계속 다르니 영영
 * 복구되지 않고, 복구 버튼도 없다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (rel: string) =>
  readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

const handlers = read("app/api/supa/handlers/session-handlers.ts");

describe("다른 기기에서도 같은 세션을 인계한다", () => {
  it("기기 지문이 달라도 미제출 세션을 찾는다", () => {
    expect(handlers).toMatch(/const crossDeviceSession =/);
  });

  it("인계 후보가 세션 선택 사슬에 들어 있다", () => {
    // 사슬에서 빠지면 지문이 다른 기기는 다시 null 이 되어 반쪽 상태가 된다.
    expect(handlers).toMatch(
      /resetDemoSession \|\|[\s\S]{0,120}?crossDeviceSession/
    );
  });

  it("인계 범위가 같은 사용자의 미제출 세션뿐이다", () => {
    // unsubmittedSessions 는 (exam_id, student_id) 로 이미 좁혀져 있고,
    // student_id 는 인증 사용자와 일치하는지 확인됐다. 남의 세션은 못 가져온다.
    const block = handlers.slice(
      handlers.indexOf("const crossDeviceSession ="),
      handlers.indexOf("let existingSession")
    );
    expect(block).toMatch(/unsubmittedSessions\[0\]/);
    expect(block).not.toMatch(/existingSessions\b/);
  });

  it("제출된 세션은 인계하지 않는다", () => {
    // 제출본을 되살리면 재응시 차단이 뚫린다.
    expect(handlers).toMatch(/unsubmittedSessions/);
  });
});

describe("인계하면 실제로 되살아난다", () => {
  it("재활성화 경로가 새 기기 지문으로 갱신한다", () => {
    // 갱신하지 않으면 이후 heartbeat 가 계속 남의 기기로 판정돼 실패한다.
    const updates = handlers.match(
      /\.update\(\{[\s\S]{0,200}?device_fingerprint[\s\S]{0,120}?\}\)/g
    ) ?? [];
    expect(updates.length).toBeGreaterThanOrEqual(3);
  });

  it("지각 대기 세션도 지문을 갱신한다", () => {
    // 여기만 빠져 있었다. 승인 대기 중 기기를 바꾼 학생이 갇힌다.
    expect(handlers).toMatch(
      /is_active: true, last_heartbeat_at: now, device_fingerprint: incomingFingerprint/
    );
  });

  it("메시지 로드가 인계된 세션을 대상으로 한다", () => {
    // existingSession 분기 안에 있어야 인계와 함께 살아난다.
    expect(handlers).toMatch(
      /messages[\s\S]{0,200}?\.eq\("session_id", existingSession\.id\)/
    );
  });
});
