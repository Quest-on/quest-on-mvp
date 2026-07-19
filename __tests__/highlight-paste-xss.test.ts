/**
 * 강사 채점 화면 저장형 XSS 회귀 가드
 *
 * 버그: FinalAnswerCard 가 학생 답안을 `dangerouslySetInnerHTML` 로 렌더하면서,
 * 답안이 HTML "처럼" 보이면(정규식 /<[^>]+>/ 매칭) 원문을 이스케이프 없이 그대로
 * 렌더했다. 학생이 답안에 <script>·<img onerror> 를 넣으면 강사의 인증 세션에서
 * 임의 JS 가 실행될 수 있었다(평문 textarea 입력으로도 도달 가능).
 *
 * 이 테스트는 highlightPastedContent 가 어떤 입력이든 항상 이스케이프하여, 실행 가능한
 * 원본 태그가 결과에 남지 않음을 잠근다. (paste 하이라이트가 삽입하는 <mark> 만 허용)
 */
import { describe, expect, it } from "vitest";
import { highlightPastedContent, type PasteLog } from "@/lib/highlight-paste";

// 결과 HTML 에서 <mark> 하이라이트 태그를 제거한 뒤, 남은 각괄호 태그가 있는지 검사한다.
// <mark ...> / </mark> 는 코드가 의도적으로 삽입하는 안전한 태그이므로 제외한다.
function hasExecutableTag(html: string): boolean {
  const withoutMark = html.replace(/<\/?mark[^>]*>/g, "");
  return /<[a-zA-Z/!]/.test(withoutMark);
}

describe("highlightPastedContent — 저장형 XSS 차단", () => {
  it("<script> 답안을 이스케이프한다 (실행 태그 미포함)", () => {
    const answer = '<script>alert(document.cookie)</script>';
    const out = highlightPastedContent(answer, []);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(hasExecutableTag(out)).toBe(false);
  });

  it("<img onerror> 답안을 이스케이프한다", () => {
    const answer = '<img src=x onerror=alert(1)>';
    const out = highlightPastedContent(answer, []);
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain("&lt;img");
    expect(hasExecutableTag(out)).toBe(false);
  });

  it("일반 부등호가 든 답안도 이스케이프한다 (오탐 방지 + 안전)", () => {
    const answer = "if a < b and b > c then true";
    const out = highlightPastedContent(answer, []);
    expect(out).toContain("&lt;");
    expect(out).toContain("&gt;");
    expect(hasExecutableTag(out)).toBe(false);
  });

  it("붙여넣기 로그가 있어도 위험 태그는 실행되지 않고 <mark> 만 삽입된다", () => {
    const answer = 'safe text <img src=x onerror=alert(1)> more';
    const logs: PasteLog[] = [
      {
        id: "1",
        question_id: "q1",
        length: 4,
        pasted_text: "safe",
        is_internal: false,
        suspicious: true,
        timestamp: "2026-01-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const out = highlightPastedContent(answer, logs);
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain("&lt;img");
    expect(hasExecutableTag(out)).toBe(false);
    // 하이라이트 기능 자체는 동작해야 한다
    expect(out).toContain("<mark");
  });

  it("빈 답안은 빈 문자열", () => {
    expect(highlightPastedContent("", [])).toBe("");
  });

  it("정상 텍스트는 내용이 보존된다(줄바꿈은 <br>)", () => {
    const out = highlightPastedContent("첫째 줄\n둘째 줄", []);
    expect(out).toContain("첫째 줄");
    expect(out).toContain("둘째 줄");
    expect(out).toContain("<br>");
  });
});
