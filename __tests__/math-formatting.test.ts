import { describe, expect, it } from "vitest";
import {
  containsMathSyntax,
  normalizeMathDelimiters,
  renderMathInHtml,
} from "@/lib/math-formatting";

describe("normalizeMathDelimiters", () => {
  it("converts slash-style delimiters to dollar delimiters", () => {
    const result = normalizeMathDelimiters(
      "식은 \\(x^2 + y^2\\) 이고 적분은 \\[\\int_0^1 x dx\\] 입니다."
    );

    expect(result).toContain("$x^2 + y^2$");
    expect(result).toContain("$$\\int_0^1 x dx$$");
  });
});

describe("containsMathSyntax", () => {
  it("detects latex delimiters", () => {
    expect(containsMathSyntax("여기 \\(x^2\\) 가 있습니다.")).toBe(true);
    expect(containsMathSyntax("여기 $x^2$ 가 있습니다.")).toBe(true);
    expect(containsMathSyntax("일반 문장입니다.")).toBe(false);
  });
});

describe("renderMathInHtml", () => {
  it("renders inline and block math to katex html", () => {
    const result = renderMathInHtml(
      "<p>인라인 \\(x^2\\) 와 블록 \\[\\int_0^1 x dx\\]</p>"
    );

    expect(result).toContain('class="katex"');
    expect(result).toContain('class="qa-math-block');
  });
});

describe("renderMathInHtml 블록 수식 치환", () => {
  // 블록 수식 자리 표시자를 문자열 치환값으로 바꾸면 `$&`, `` $` ``, `$'` 가 특수 패턴으로
  // 해석된다. 수식 식 안에 이 문자들이 있으면 문서의 다른 부분이 렌더 결과 안으로 복제된다.
  // 이 함수는 정화 뒤에 불리므로 복제된 문자열은 정화를 거치지 않는다.
  const MARKER = "BEFORE_MARKER_7f3a";

  it.each([
    ["$`", "앞부분"],
    ["$'", "뒷부분"],
    ["$&", "일치 부분"],
  ])("식에 %s 가 있어도 문서의 %s 이 복제되지 않는다", (pattern) => {
    const input = `<p>${MARKER}</p>$$x ${pattern} y$$<p>AFTER_MARKER_9c1d</p>`;
    const out = renderMathInHtml(input);
    expect(out.split(MARKER).length - 1).toBe(1);
    expect(out.split("AFTER_MARKER_9c1d").length - 1).toBe(1);
    expect(out).not.toContain("__QA_BLOCK_MATH_");
  });

  it("블록 수식이 여러 개여도 각 자리에 자기 수식만 들어간다", () => {
    const out = renderMathInHtml("$$a$$ 중간 $$b$$");
    expect(out.match(/qa-math-block/g)?.length).toBe(2);
    expect(out).not.toContain("__QA_BLOCK_MATH_");
  });
});
