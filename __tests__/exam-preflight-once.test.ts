/**
 * preflight 는 한 번만 묻는다 (이슈 #474).
 *
 * 고지를 처음 보는 학생(= 모든 학생의 첫 시험)과 모든 데모 미리보기에서
 * preflight 모달이 두 번 떴다. 수락 → 고지 확인이 init 캐시를 고침 → init
 * effect 재실행 → 캐시 안의 `preflight_accepted_at` 이 여전히 null 이라
 * 모달을 다시 연다.
 *
 * 판정과 패치를 `lib/exam-preflight.ts` 로 뺐다. 여기서는 (1) 패치된 init
 * 으로는 preflight 가 필요 없다, (2) 패치가 되돌림을 만들지 않는다, (3) 훅과
 * 페이지가 실제로 그 둘을 쓴다를 고정한다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyPreflightAccepted,
  needsPreflight,
  type PreflightInit,
} from "@/lib/exam-preflight";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** 고지를 처음 보는 학생의 init 응답 — 이 결함이 걸리는 모양 그대로다. */
function firstTimeInit(overrides: Partial<PreflightInit> = {}): PreflightInit & { exam: { id: string } } {
  return {
    ok: true,
    exam: { id: "exam-1" },
    disclosureAcknowledged: false,
    sessionStatus: "joined",
    sessionStartTime: null,
    timeRemaining: 3600,
    sessionReactivated: false,
    session: { status: "joined", preflight_accepted_at: null, submitted_at: null },
    ...overrides,
  };
}

const ACCEPTED = {
  preflightAcceptedAt: "2026-09-25T05:00:00.000Z",
  status: "in_progress",
  sessionStartTime: "2026-09-25T05:00:00.000Z",
  timeRemaining: 3599,
};

describe("수락 뒤 캐시로는 preflight 를 다시 묻지 않는다 (#474)", () => {
  it("첫 시험 학생은 입장 때 preflight 가 필요하다", () => {
    expect(needsPreflight(firstTimeInit())).toBe(true);
  });

  it("수락을 반영한 캐시로는 preflight 가 필요 없다", () => {
    const patched = applyPreflightAccepted(firstTimeInit(), ACCEPTED);
    expect(
      needsPreflight(patched),
      "수락했는데 캐시가 다시 preflight 를 요구한다 — effect 재실행 때 모달이 한 번 더 뜬다"
    ).toBe(false);
  });

  it("고지 확인만 고친 캐시는 여전히 preflight 를 요구한다 — 예전 패치가 모달을 두 번 띄운 이유", () => {
    // 예전 acknowledgeDisclosure 가 하던 패치 그대로다. 이 단정은 원인을
    // 기록한다: 부분 패치로는 막을 수 없다.
    const partial = { ...firstTimeInit(), disclosureAcknowledged: true };
    expect(needsPreflight(partial)).toBe(true);
  });

  it("데모 미리보기도 한 번이다 — 미리보기는 서버가 고지 확인을 기록하지 않는다", () => {
    const preview = firstTimeInit({ sessionStatus: "in_progress", session: {
      status: "in_progress", preflight_accepted_at: null, submitted_at: null,
    } });
    expect(needsPreflight(applyPreflightAccepted(preview, ACCEPTED))).toBe(false);
  });
});

describe("패치가 되돌림을 만들지 않는다 (#474)", () => {
  // effect 는 캐시가 바뀌면 전체 다시 돈다. 그때 세우는 상태가 preflight
  // 응답과 다르면, 시작된 시험의 학생이 init 시점 상태(대기실 등)로 돌아간다.
  const patched = applyPreflightAccepted(firstTimeInit({ sessionReactivated: true }), ACCEPTED);

  it("세션 상태는 preflight 응답을 따른다", () => {
    expect(patched.sessionStatus).toBe("in_progress");
    expect(patched.session?.status).toBe("in_progress");
  });

  it("시작 시각과 남은 시간도 응답을 따른다", () => {
    expect(patched.sessionStartTime).toBe(ACCEPTED.sessionStartTime);
    expect(patched.timeRemaining).toBe(ACCEPTED.timeRemaining);
  });

  it("복원 토스트를 다시 띄우지 않는다", () => {
    expect(patched.sessionReactivated).toBe(false);
  });

  it("다른 init 필드는 그대로 둔다", () => {
    expect((patched as { exam?: unknown }).exam).toEqual({ id: "exam-1" });
  });

  it("실패 응답과 세션 없는 init 은 건드리지 않는다", () => {
    const failed = { ok: false } as PreflightInit;
    expect(applyPreflightAccepted(failed, ACCEPTED)).toBe(failed);
    const noSession = { ok: true, session: null } as PreflightInit;
    expect(applyPreflightAccepted(noSession, ACCEPTED)).toBe(noSession);
  });
});

describe("판정 규칙은 그대로다 (AC-15 회귀 방지)", () => {
  it("이미 수락하고 고지도 확인한 학생은 묻지 않는다", () => {
    expect(needsPreflight(firstTimeInit({
      disclosureAcknowledged: true,
      session: { status: "in_progress", preflight_accepted_at: "t", submitted_at: null },
      sessionStatus: "in_progress",
    }))).toBe(false);
  });

  it("세션은 수락했지만 고지를 확인한 적 없는 레거시 세션은 묻는다", () => {
    expect(needsPreflight(firstTimeInit({
      disclosureAcknowledged: false,
      session: { status: "in_progress", preflight_accepted_at: "t", submitted_at: null },
      sessionStatus: "in_progress",
    }))).toBe(true);
  });

  it("지각 입장도 묻는다", () => {
    expect(needsPreflight(firstTimeInit({ sessionStatus: "late_pending" }))).toBe(true);
  });

  it("제출한 세션은 묻지 않는다", () => {
    expect(needsPreflight(firstTimeInit({ sessionStatus: "submitted" }))).toBe(false);
    expect(needsPreflight(firstTimeInit({
      session: { status: "in_progress", preflight_accepted_at: null, submitted_at: "t" },
    }))).toBe(false);
  });

  it("세션이 없으면 묻지 않는다", () => {
    expect(needsPreflight({ ok: true, session: null })).toBe(false);
  });
});

describe("훅과 페이지가 공용 판정·패치를 쓴다 (#474)", () => {
  const hook = read("hooks/useExamSession.ts");
  const page = read("app/(app)/exam/[code]/page.tsx");

  it("init effect 가 needsPreflight 로 판정한다 — 조건을 따로 적지 않는다", () => {
    expect(hook).toMatch(/needsPreflight\(initData\)/);
    // 예전 인라인 조건이 되살아나면 판정이 두 벌이 된다.
    expect(hook).not.toMatch(/needsPreflightStatuses/);
  });

  it("고지 확인이 캐시를 부분 패치하지 않는다", () => {
    expect(hook).toMatch(/applyPreflightAccepted\(/);
    expect(
      hook,
      "disclosureAcknowledged 만 고치는 부분 패치가 돌아왔다 — 모달이 두 번 뜬다"
    ).not.toMatch(/\{\s*\.\.\.current,\s*disclosureAcknowledged:\s*true\s*\}/);
  });

  it("페이지가 preflight 응답을 그대로 넘긴다", () => {
    expect(page).toMatch(/session\.acknowledgeDisclosure\(body\)/);
  });
});
