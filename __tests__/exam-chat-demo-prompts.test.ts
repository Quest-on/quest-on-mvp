import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 데모 채팅 예시 질문 칩 (#210)
 *
 * 데모를 처음 겪는 교수자가 빈 채팅 화면에서 무엇을 물을 수 있는지 몰라 막힌다.
 * 그런데 이건 **시험**이라 일반 SaaS 온보딩 조언을 그대로 쓰면 안 된다 —
 * 제안 문구가 답안에 영향을 주면 평가가 오염된다.
 *
 * 그래서 세 가지를 구조로 강제한다:
 *   1. 데모 미리보기에서만 렌더
 *   2. 정답이 아니라 사고 과정을 여는 문구만
 *   3. 자동 전송하지 않음 (사용자가 보고 고칠 수 있어야 한다)
 */

const SIDEBAR = readFileSync(
  path.join(process.cwd(), "components", "exam", "ExamChatSidebar.tsx"),
  "utf8"
);

const CALLER = readFileSync(
  path.join(process.cwd(), "app", "(app)", "exam", "[code]", "page.tsx"),
  "utf8"
);

const ko = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "ko", "exam.json"), "utf8")
) as { chat: Record<string, string> };

const en = JSON.parse(
  readFileSync(path.join(process.cwd(), "messages", "en", "exam.json"), "utf8")
) as { chat: Record<string, string> };

describe("실제 학생에게는 절대 노출되지 않는다", () => {
  it("칩이 isDemoPreview 조건 안에서만 렌더된다", () => {
    // 이게 깨지면 일반 응시생이 예시 질문을 보고 그대로 묻는다.
    expect(SIDEBAR).toMatch(/\{isDemoPreview && \(/);
  });

  it("기본값이 false 라 넘기지 않으면 안 뜬다", () => {
    // 새 호출부가 prop 을 빠뜨려도 안전한 쪽으로 떨어져야 한다.
    expect(SIDEBAR).toMatch(/isDemoPreview = false/);
  });

  it("클라이언트가 데모 여부를 스스로 판정하지 않는다", () => {
    // 서버가 내려준 session.demoPreview 만 신뢰한다.
    // 클라이언트가 is_demo 를 직접 보면 남의 데모나 일반 시험까지 우회된다.
    expect(CALLER).toMatch(/isDemoPreview=\{session\.demoPreview === true\}/);
    // 주석은 제외한다 — 설명문에 is_demo 라는 단어가 들어가 자기 자신에 걸린다.
    const code = SIDEBAR.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/is_demo/);
  });
});

describe("자동 전송하지 않는다", () => {
  it("칩 클릭은 입력창을 채우기만 한다", () => {
    // 바로 보내면 사용자가 고칠 기회가 없고, AI 과의존을 키운다.
    expect(SIDEBAR).toMatch(/onClick=\{\(\) => setChatMessage\(t\(key\)\)\}/);
    // 칩 블록 안에서 전송 함수를 부르면 안 된다.
    const block = SIDEBAR.slice(
      SIDEBAR.indexOf("{isDemoPreview && ("),
      SIDEBAR.indexOf("{isDemoPreview && (") + 900
    );
    expect(block).not.toMatch(/sendChatMessage/);
  });
});

describe("문구가 정답을 요구하지 않는다", () => {
  const prompts = ["prompt1", "prompt2", "prompt3"] as const;

  it("ko/en 양쪽에 세 개가 있다", () => {
    for (const key of prompts) {
      expect(ko.chat[key], `ko.${key}`).toBeTruthy();
      expect(en.chat[key], `en.${key}`).toBeTruthy();
    }
    expect(ko.chat.promptsTitle).toBeTruthy();
    expect(en.chat.promptsTitle).toBeTruthy();
  });

  it("정답·답 요구형 표현이 없다", () => {
    // "정답 알려줘" 류는 이 제품이 의도한 사용이 아니고, 채점 대상 답안을
    // AI 가 대신 쓰게 만든다.
    const all = prompts.map((k) => ko.chat[k]).join(" ");
    expect(all).not.toMatch(/정답|답을 알려|답안을 써|대신 써/);

    const allEn = prompts.map((k) => en.chat[k]).join(" ");
    expect(allEn).not.toMatch(/answer for me|give me the answer|write it for me/i);
  });

  it("사고 과정을 여는 문구다", () => {
    // 물음표로 끝나거나 지적을 요청하는 형태여야 한다.
    for (const key of prompts) {
      expect(ko.chat[key]).toMatch(/\?|주세요/);
    }
  });
});
