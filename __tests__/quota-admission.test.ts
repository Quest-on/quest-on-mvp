import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAdmissionFallback } from "@/lib/quota-admission";

/**
 * 이슈 #326 의 재현.
 *
 * 발행·학생 한도는 `admit_exam_session` SQL 함수 한 곳에서만 판정한다
 * (교수자 단위 advisory lock 으로 동시 입장까지 직렬화). 그런데 **그 RPC 가
 * 에러를 내면** 호출부가 로그만 남기고 세션을 직접 만들었다:
 *
 *   app/api/supa/handlers/session-handlers.ts — upsert(...)  ← 입장 경로
 *   app/api/feedback/route.ts                 — upsert(...)
 *
 * RPC 장애 = 모든 free 계정 무제한. 장애가 조용해서 언제부터 샜는지도 모른다.
 *
 * "한도 장애로 수업을 멈추면 안 된다" 는 판단 자체는 맞다. 다만 그건
 * **이미 응시 중인 학생**에게만 맞는 말이다. RPC 는 원래 그 둘을 가른다 —
 * 기존 세션이 있으면 한도를 보지 않고 `admitted=true, created=false` 로
 * 즉시 돌려준다. 에러가 나면 호출부가 그 구분을 잃는 게 진짜 결함이다.
 *
 * 그래서 규칙은 하나다: **RPC 가 실패하면 세션을 새로 만들지 않는다.**
 * 있으면 이어 가고, 없으면 새 입장이므로 막는다.
 */

describe("admit RPC 실패 시 처리 (#326)", () => {
  it("기존 세션이 있으면 이어 간다 — 한도는 입장 때 이미 봤다", () => {
    expect(resolveAdmissionFallback("sess-1")).toEqual({
      kind: "continue",
      sessionId: "sess-1",
    });
  });

  it("기존 세션이 없으면 막는다 — 이건 새 입장이다", () => {
    expect(resolveAdmissionFallback(null)).toEqual({ kind: "deny" });
    expect(resolveAdmissionFallback(undefined)).toEqual({ kind: "deny" });
    expect(resolveAdmissionFallback("")).toEqual({ kind: "deny" });
  });
});

describe("호출부가 실패 경로에서 세션을 만들지 않는다 (#326)", () => {
  const SITES = [
    "app/api/supa/handlers/session-handlers.ts",
    "app/api/feedback/route.ts",
    "app/api/chat/route.ts",
  ] as const;

  /** `if (admitError) { … }` 블록만 잘라낸다. */
  function admitErrorBlocks(src: string): string[] {
    const out: string[] = [];
    let idx = src.indexOf("if (admitError)");
    while (idx !== -1) {
      const open = src.indexOf("{", idx);
      if (open === -1) break;
      let depth = 0;
      let end = open;
      for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      out.push(src.slice(open, end + 1));
      idx = src.indexOf("if (admitError)", end);
    }
    return out;
  }

  it.each(SITES)("%s 의 admitError 분기에 쓰기가 없다", (path) => {
    const src = readFileSync(join(process.cwd(), path), "utf8");
    const blocks = admitErrorBlocks(src);
    expect(blocks.length, `${path} 에 admitError 분기가 없다 — 검사 대상을 잃었다`).toBeGreaterThan(0);
    for (const b of blocks) {
      // 이 분기에서 행을 만들면 한도를 통째로 우회한다.
      expect(b, `${path} 의 실패 경로가 세션을 만든다`).not.toMatch(/\.upsert\(/);
      expect(b, `${path} 의 실패 경로가 세션을 만든다`).not.toMatch(/\.insert\(/);
    }
  });

  it.each(SITES)("%s 가 공용 판정을 쓴다", (path) => {
    const src = readFileSync(join(process.cwd(), path), "utf8");
    expect(src, `${path} 가 resolveAdmissionFallback 을 안 쓴다`).toMatch(
      /resolveAdmissionFallback\(/
    );
  });
});

describe("데모 소유자 미리보기 예외 (#451)", () => {
  it("기존 세션이 없어도 데모 소유자 미리보기는 통과한다", () => {
    expect(resolveAdmissionFallback(null, true)).toEqual({
      kind: "proceed",
      reason: "demo_owner_preview",
    });
  });

  it("기존 세션이 있으면 예외보다 지속이 먼저다", () => {
    // 둘 다 통과지만 의미가 다르다. 이어 가는 쪽은 세션 id 를 돌려줘야 한다.
    expect(resolveAdmissionFallback("s-1", true)).toEqual({
      kind: "continue",
      sessionId: "s-1",
    });
  });

  it("데모가 아니면 막는다", () => {
    expect(resolveAdmissionFallback(null, false)).toEqual({ kind: "deny" });
  });

  it("판정 불능(null)은 통과가 아니다", () => {
    // 모를 때 "데모다" 로 단정하면 그 순간 한도가 샌다.
    expect(resolveAdmissionFallback(null, null)).toEqual({ kind: "deny" });
  });

  it("인자를 안 주면 기존 동작 그대로 막는다", () => {
    expect(resolveAdmissionFallback(null)).toEqual({ kind: "deny" });
    expect(resolveAdmissionFallback(undefined)).toEqual({ kind: "deny" });
  });
});
