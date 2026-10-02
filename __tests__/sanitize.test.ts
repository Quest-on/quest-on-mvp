import { describe, it, expect } from "vitest";
import { sanitizeChatMessage, sanitizeUserInput, stripEmoji } from "@/lib/sanitize";

describe("sanitizeUserInput", () => {
  it("returns plain text unchanged", () => {
    expect(sanitizeUserInput("Hello, world!")).toBe("Hello, world!");
  });

  it("strips <script> tags with content", () => {
    expect(sanitizeUserInput('<script>alert("xss")</script>')).toBe("");
  });

  it("strips <script> tags case-insensitive", () => {
    expect(sanitizeUserInput("<SCRIPT>alert(1)</SCRIPT>")).toBe("");
  });

  it("removes onclick event handler and strips tags", () => {
    const result = sanitizeUserInput('<div onclick="alert(1)">test</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("test");
  });

  it("removes onerror event handler", () => {
    const result = sanitizeUserInput('<img onerror="alert(1)" src="x">');
    expect(result).not.toContain("onerror");
  });

  it("strips javascript: URI from href", () => {
    const result = sanitizeUserInput(
      '<a href="javascript:alert(1)">click</a>'
    );
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  it("removes dangerous tags like iframe", () => {
    expect(
      sanitizeUserInput('<iframe src="evil.com"></iframe>')
    ).toBe("");
  });

  it("strips CSS expression from style attribute", () => {
    const result = sanitizeUserInput(
      '<div style="width: expression(alert(1))">test</div>'
    );
    expect(result).not.toContain("expression");
    expect(result).toContain("test");
  });

  it("strips all HTML tags (plain text output only)", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeUserInput(html)).toBe("Hello world");
  });

  it("handles unicode content unchanged", () => {
    const unicode = "안녕하세요 テスト";
    expect(sanitizeUserInput(unicode)).toBe(unicode);
  });

  it("handles nested malicious payloads", () => {
    const payload = '<img src=x onerror="alert(1)"><svg onload="alert(2)">';
    const result = sanitizeUserInput(payload);
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onload");
    expect(result).not.toContain("<");
  });

  it("handles data: URI attacks", () => {
    const result = sanitizeUserInput(
      '<a href="data:text/html,<script>alert(1)</script>">click</a>'
    );
    expect(result).not.toContain("data:");
    expect(result).toContain("click");
  });

  it("handles mutation XSS vectors", () => {
    // DOMPurify handles mutation-based XSS that regex cannot
    const result = sanitizeUserInput('<noscript><p title="</noscript><img src=x onerror=alert(1)>">');
    expect(result).not.toContain("onerror");
  });
});

// ── 학생 채팅 메시지 정화 (#523) ─────────────────────────────────────────────
//
// `sanitizeUserInput` 은 `<` 와 `>` 사이를 무조건 태그로 보고 지워서, 조건식 `income < 3000 ... age > 40`
// 의 가운데가 통째로 사라졌다. 채팅 메시지는 화면에서 React 텍스트(또는 raw HTML 을 받지 않는
// react-markdown)로만 그려지므로 "태그처럼 생긴 것"만 지운다. 이 방어선이 약해지지 않았다는 것은
// 아래 XSS 회귀 세트와 고정점 검사가 지킨다.

/** 태그처럼 생긴 것: `<` 바로 뒤가 영문자, `/`, `!`, `?` 이고 이어서 `>` 가 있다. */
const TAG_LIKE = /<[A-Za-z/!?][^>]*>/;

describe("sanitizeChatMessage — 조건식, 부등호, 코드는 그대로 통과한다 (#523)", () => {
  it.each([
    "income < 3000 이고 age > 40 인 행만 남겨 주세요",
    "p < 0.05 이므로 유의, 다음은 x>5",
    "df[df['x'] < 5] 와 df[df['y'] > 2]",
    "a <= b 이고 c >= d",
    "SELECT * FROM t WHERE a <> b AND c > 1",
    "1 < 2 < 3 > 0",
    "x<5 and y>3",
    "if (a < b) { x = b > c; }",
    "<보기> 에서 고르세요",
    "첫째 줄 a < b\n둘째 줄 c > d",
  ])("%s", (input) => {
    expect(sanitizeChatMessage(input)).toBe(input);
  });

  it("조건식 사이에 태그가 섞여 있으면 태그만 지우고 조건식은 남긴다", () => {
    expect(sanitizeChatMessage("x < 5 <img src=x onerror=alert(1)> y > 3")).toBe("x < 5  y > 3");
    expect(sanitizeChatMessage("a < b <b>bold</b> c > d")).toBe("a < b bold c > d");
    expect(sanitizeChatMessage("if a < b then <script>alert(1)</script> else c > d")).toBe(
      "if a < b then  else c > d"
    );
  });

  it("엔티티 해제는 sanitizeUserInput 과 같다 (바꾸지 않은 동작)", () => {
    for (const input of ["Tom &amp; Jerry", "5 &gt; 3 &amp;&amp; 2 &lt; 4", "그냥 문장입니다"]) {
      expect(sanitizeChatMessage(input)).toBe(sanitizeUserInput(input));
    }
  });
});

describe("sanitizeChatMessage — XSS 방어는 약해지지 않았다 (#523)", () => {
  const XSS_VECTORS: Array<[label: string, input: string, expected: string]> = [
    ["script", "<script>alert(1)</script>", ""],
    ["script 대문자", "<SCRIPT>alert(1)</SCRIPT>", ""],
    ["script 대소문자와 공백", "<ScRiPt >alert(1)</sCrIpT >", ""],
    ["script 속성과 줄바꿈", '<script\n type="text/javascript"\n>alert(1)</script\n>', ""],
    ["script src", "<script src=//evil.example/x.js></script>", ""],
    ["img onerror", "<img src=x onerror=alert(1)>", ""],
    ["img 슬래시 구분", "<IMG/SRC=x/ONERROR=alert(1)>", ""],
    ["svg onload", "<svg onload=alert(1)>", ""],
    ["svg 슬래시", "<svg/onload=alert(1)>", ""],
    ["a href javascript", "<a href=javascript:alert(1)>click</a>", "click"],
    ["a href 따옴표", '<a href="javascript:alert(1)">click</a>', "click"],
    ["div 이벤트 핸들러", '<div onclick="alert(1)">test</div>', "test"],
    ["body onload", "<body onload=alert(1)>", ""],
    ["iframe", '<iframe src="javascript:alert(1)"></iframe>', ""],
    ["details ontoggle", "<details open ontoggle=alert(1)>x</details>", "x"],
    ["input autofocus", "<input autofocus onfocus=alert(1)>", ""],
    ["style", "<style>body{background:url(javascript:alert(1))}</style>", ""],
    ["주석 안의 img", "<!-- <img src=x onerror=alert(1)> -->", ""],
    ["xml 선언", '<?xml version="1.0"?>', ""],
    ["닫는 태그만", "</script>", ""],
    // 지운 뒤에 새 태그가 만들어지는 우회. 좁힌 정규식은 한 번만 적용하면 이걸 놓친다.
    ["중첩 scr<script>ipt", "<scr<script>ipt>alert(1)</scr</script>ipt>", ""],
    ["중첩 <<script>script>", "<<script>script>alert(1)<</script>/script>", ""],
    ["지운 자리에서 img 가 생긴다", "<<b>img src=x onerror=alert(1)>", ""],
    ["지운 자리에서 script 가 생긴다", "<<x>script>alert(1)<</x>/script>", ""],
  ];

  it.each(XSS_VECTORS)("%s", (_label, input, expected) => {
    const out = sanitizeChatMessage(input);
    expect(out).toBe(expected);
    expect(out).not.toMatch(TAG_LIKE);
  });

  it("엔티티로 감춘 태그는 무력화 대상이 아니다 — 텍스트로만 렌더되므로 이전과 같게 해제된다", () => {
    // sanitizeUserInput 도 같은 결과를 낸다. 이 값이 실행되지 않는 이유는 모든 렌더 지점이
    // 텍스트 이스케이프이기 때문이다(PR 본문의 렌더 경로 조사).
    expect(sanitizeChatMessage("&lt;b&gt;x&lt;/b&gt;")).toBe(sanitizeUserInput("&lt;b&gt;x&lt;/b&gt;"));
  });

  // 고정점: 끝난 결과에는 태그처럼 생긴 것이 하나도 남지 않고, 한 번 더 돌려도 변하지 않는다.
  // 입력은 결정적 난수로 만든 `<`, `>`, `/`, `!`, `?`, 태그 이름, 속성 조각의 조합이다.
  it("임의 조합에서도 태그처럼 생긴 것이 남지 않고 한 번 더 돌려도 같다 (고정점)", () => {
    const tokens = [
      "<", ">", "/", "!", "?", "-", "<<", ">>", "<script>", "</script>", "<img ", "<svg ", "<!--", "-->",
      "script", "img", "svg", "a", "x", "b", " ", "=", '"', "onerror", "alert(1)", "\n", "5",
    ];
    let seed = 523;
    const next = () => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let n = 0; n < 4000; n++) {
      const length = 1 + Math.floor(next() * 14);
      let input = "";
      for (let i = 0; i < length; i++) input += tokens[Math.floor(next() * tokens.length)];

      const out = sanitizeChatMessage(input);
      expect(out, JSON.stringify(input)).not.toMatch(TAG_LIKE);
      expect(sanitizeChatMessage(out), JSON.stringify(input)).toBe(out);
      // 태그 시작처럼 보이는 곳이 없으면 한 글자도 바뀌지 않는다.
      if (!/<[A-Za-z/!?]/.test(input)) expect(out, JSON.stringify(input)).toBe(input);
    }
  });

  // 채팅 메시지 상한(10000자)을 꽉 채운 병적인 입력도 제때 끝난다. 닫히지 않는 `<script>` 나 `<a ` 는
  // 정규식이 끝까지 훑게 만드는 모양이라 반복 적용(고정점)이 시간을 곱하지 않는지 본다.
  it.each([
    ["닫히지 않는 <script>", "<script>".repeat(1250)],
    ["닫히지 않는 <a ", "<a ".repeat(3333)],
    ["<<b> 반복 뒤 img", "<<b>".repeat(2400) + "img src=x onerror=alert(1)>"],
    ["여는 꺾쇠만 반복", "<".repeat(10000)],
  ])("%s", (_label, input) => {
    const started = Date.now();
    const out = sanitizeChatMessage(input);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(out).not.toMatch(TAG_LIKE);
  });
});

describe("sanitizeChatMessage — 알려진 한계 (#523)", () => {
  // 태그 모양인 학생 입력은 계속 지워진다. 렌더가 모두 텍스트 이스케이프라도 `<` 뒤가 영문자인
  // 입력은 "태그처럼 생긴 것"과 구분할 수 없어서 방어선 쪽을 우선했다.
  it("`<NA>`, `<b>` 처럼 태그 모양인 입력은 지워진다", () => {
    expect(sanitizeChatMessage("값이 <NA> 인 행을 세어 주세요")).toBe("값이  인 행을 세어 주세요");
    expect(sanitizeChatMessage("<b>굵게</b> 쓰면 되나요")).toBe("굵게 쓰면 되나요");
  });

  it("`<` 바로 뒤가 영문자인 부등호는 같은 줄의 다음 `>` 까지 지워진다", () => {
    expect(sanitizeChatMessage("x<y and y>z")).toBe("xz");
  });
});

describe("stripEmoji", () => {
  it("removes emoji while keeping text", () => {
    expect(stripEmoji("좋아요 ✅ 핵심만 봅니다 🎯")).toBe("좋아요  핵심만 봅니다 ");
  });

  it("removes keycap emoji sequences", () => {
    expect(stripEmoji("1️⃣ 먼저 확인")).toBe(" 먼저 확인");
  });
});
