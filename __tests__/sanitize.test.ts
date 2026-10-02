import { describe, it, expect } from "vitest";
import { defaultTreeAdapter, html as parse5Html, parseFragment } from "parse5";
import {
  CHAT_SANITIZE_MAX_PASSES,
  sanitizeChatMessage,
  sanitizeUserInput,
  stripEmoji,
} from "@/lib/sanitize";

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
// 아래 XSS 회귀 세트, 고정점 검사, 깊은 중첩 검사(실제 HTML 파서 parse5 로 요소 0개 확인)가 지킨다.
//
// 보장 범위: 엔티티(`&lt;` 등)가 없는 입력에서는 결과에 태그처럼 생긴 것이 남지 않는다. 엔티티 해제는
// 태그 제거 뒤에 일어나므로(`sanitizeUserInput` 과 같은 순서) 엔티티로 만든 태그는 이전과 같게 통과한다.
// 그 값이 실행되지 않는 이유는 학생 메시지가 모든 화면에서 텍스트로만 그려지기 때문이다.

/** 태그처럼 생긴 것: `<` 바로 뒤가 영문자, `/`, `!`, `?` 이고 이어서 `>` 가 있다. */
const TAG_LIKE = /<[A-Za-z/!?][^>]*>/;

/** 실제 HTML5 파서(parse5)가 `<div>` 의 innerHTML 로 읽었을 때 만들어지는 요소 수. */
type Parse5Node = Parameters<typeof defaultTreeAdapter.isElementNode>[0];
function elementCount(markup: string): number {
  const context = defaultTreeAdapter.createElement("div", parse5Html.NS.HTML, []);
  const root = parseFragment(context, markup, {});
  const walk = (node: Parse5Node): number => {
    let count = defaultTreeAdapter.isElementNode(node) ? 1 : 0;
    const children = "childNodes" in node ? (node.childNodes as Parse5Node[]) : [];
    for (const child of children) count += walk(child);
    if (defaultTreeAdapter.isElementNode(node) && "content" in node) {
      count += walk(node.content as unknown as Parse5Node);
    }
    return count;
  };
  return walk(root as unknown as Parse5Node);
}

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

  it("엔티티로 만든 태그는 이전과 같게 해제된다 — 정화가 막는 대상이 아니다", () => {
    // 엔티티 해제는 태그 제거 뒤에 일어난다. `sanitizeUserInput` 도 같은 결과를 낸다(바꾸지 않은 동작).
    // 이 값이 실행되지 않는 이유는 모든 렌더 지점이 텍스트 이스케이프이기 때문이다.
    for (const input of ["&lt;b&gt;x&lt;/b&gt;", "&lt;img src=x onerror=alert(1)&gt;"]) {
      expect(sanitizeChatMessage(input)).toBe(sanitizeUserInput(input));
    }
    expect(sanitizeChatMessage("&lt;img src=x onerror=alert(1)&gt;")).toBe("<img src=x onerror=alert(1)>");
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

});

// ── 참조 구현: 이전 구현(정규식 반복, f3df4bea)을 그대로 옮긴 것 ─────────────────────
//
// 선형 스캐너로 바꿔도 출력이 달라지면 안 된다. 이 참조 구현은 "바뀌지 않을 때까지 반복" 하는 이전 정규식
// 파이프라인이다(느리지만 짧은 입력에서는 정답 기준으로 쓸 수 있다). 규칙은 하나다.
//   - 참조가 상한 안에서 고정점에 닿는 입력 → 결과가 참조와 같다.
//   - 참조가 상한 안에서 못 닿는 입력        → 결과가 엄격 함수(sanitizeUserInput)와 같다(폴백).
const REF_DANGEROUS_ELEMENTS_RE = /<(script|style|iframe|noscript|object|embed|applet|form|textarea|select|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const REF_DANGEROUS_VOID_RE = /<(script|style|iframe|noscript|object|embed|applet|img|svg|math|link|meta|base)\b[^>]*\/?>/gi;
const REF_TAG_LIKE_RE = /<(?=[A-Za-z/!?])[^>]*>/g;
const REF_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&#x2F;": "/", "&#47;": "/",
};

/** 이전 구현: 바뀌지 않을 때까지 반복. 결과와 "바뀐 횟수"를 돌려준다. */
function reference(input: string): { out: string; changes: number } {
  let result = input;
  let changes = 0;
  for (;;) {
    const next = result
      .replace(REF_DANGEROUS_ELEMENTS_RE, "")
      .replace(REF_DANGEROUS_VOID_RE, "")
      .replace(REF_TAG_LIKE_RE, "");
    if (next === result) break;
    result = next;
    changes++;
  }
  return {
    out: result.replace(/&(?:amp|lt|gt|quot|#39|#x27|#x2F|#47);/g, (m) => REF_ENTITIES[m] || m),
    changes,
  };
}

/** 이 입력에서 sanitizeChatMessage 가 돌려줘야 하는 값. 고정점 확인 한 번까지 포함해 상한 안인지 본다. */
function expectedChatMessage(input: string): string {
  const ref = reference(input);
  return ref.changes + 1 <= CHAT_SANITIZE_MAX_PASSES ? ref.out : sanitizeUserInput(input);
}

// ── 깊은 중첩: 지운 자리에서 태그가 다시 만들어지는 우회 ─────────────────────────
//
// 한 번 훑을 때 한 겹씩만 벗겨지는 입력이 있다. L 겹이면 L 번 지워야 태그가 드러난다. 반복에는 상한
// (CHAT_SANITIZE_MAX_PASSES)이 있고, 상한까지 고정점에 못 닿으면 그 메시지는 이전의 엄격한
// `sanitizeUserInput` 으로 처리한다(항상 안전한 쪽으로 폴백).
describe("sanitizeChatMessage — 깊은 중첩 우회와 폴백 (#523)", () => {
  const PAYLOAD = "img src=x onerror=alert(1)>";

  const SHAPES: Array<[label: string, build: (depth: number) => string]> = [
    // 리뷰어 입력: `<<<b>b>b>img ...` 한 겹씩 벗겨지며 `<b>` 가 다시 드러난다.
    ["겹 `<`×L + `b>`×L", (d) => "<".repeat(d) + "b>".repeat(d) + PAYLOAD],
    // 마지막에 `<img ...>` 가 만들어지는 모양. 상한을 못 지키면 onerror 가 살아 남는다.
    ["겹 뒤에 `<img onerror>` 가 생긴다", (d) => "<".repeat(d) + "<b>" + "b>".repeat(d - 1) + PAYLOAD],
    // `<scr` + 겹 + `ipt>` 처럼 이름을 쪼갠다.
    ["이름 쪼개기 `<scr`×L", (d) => "<scr".repeat(d) + "<script>" + "ipt>".repeat(d) + "alert(1)</script>"],
    // 닫는 태그를 쪼갠다.
    ["닫는 태그 쪼개기", (d) => "<script>alert(1)" + "<".repeat(d) + "b>".repeat(d) + "/script>"],
    // `<i<b>mg` 처럼 이름 가운데에 겹을 끼운다.
    ["이름 가운데에 겹", (d) => "<i" + "<b>".repeat(d) + "mg src=x onerror=alert(1)>"],
    // 이름과 괄호를 함께 쪼갠다.
    ["이름과 괄호 쪼개기", (d) => "<".repeat(d) + "x>".repeat(d) + "script>alert(1)</script>"],
  ];

  it("반복 상한은 작은 상수다", () => {
    expect(CHAT_SANITIZE_MAX_PASSES).toBeGreaterThanOrEqual(3);
    expect(CHAT_SANITIZE_MAX_PASSES).toBeLessThanOrEqual(10);
  });

  it.each(SHAPES)("%s — 1~12 겹 모두 요소 0개(parse5), 상한 안은 끝까지 벗기고 상한 밖은 엄격 함수로 폴백", (_label, build) => {
    for (let depth = 1; depth <= 12; depth++) {
      const input = build(depth);
      const out = sanitizeChatMessage(input);
      const note = `depth=${depth} input=${JSON.stringify(input)} out=${JSON.stringify(out)}`;

      // 어떤 깊이든 실제 HTML 파서가 요소를 만들 수 있는 결과를 돌려주지 않는다.
      expect(elementCount(out), note).toBe(0);
      expect(out, note).not.toMatch(TAG_LIKE);

      // 상한 안은 참조(끝까지 반복)와 같고, 상한 밖은 엄격 함수와 같다.
      expect(out, note).toBe(expectedChatMessage(input));
    }
  });

  it("상한 안과 밖이 모두 실제로 실행된다 — 폴백이 한 번도 안 타면 위 검사는 아무것도 지키지 못한다", () => {
    let within = 0;
    let beyond = 0;
    let beyondDiffers = 0;
    for (const [, build] of SHAPES) {
      for (let depth = 1; depth <= 12; depth++) {
        const input = build(depth);
        const ref = reference(input);
        if (ref.changes + 1 <= CHAT_SANITIZE_MAX_PASSES) {
          within++;
        } else {
          beyond++;
          // 폴백이 참조(끝까지 반복)와 다른 값을 낸 입력이 있어야 두 경로를 가를 수 있다.
          if (sanitizeUserInput(input) !== ref.out) beyondDiffers++;
        }
      }
    }
    expect(within).toBeGreaterThan(10);
    expect(beyond).toBeGreaterThan(10);
    expect(beyondDiffers).toBeGreaterThan(5);
  });

  it("폴백 결과는 엄격 함수 결과와 다르다 — 폴백이 실제로 다른 경로임을 확인한다", () => {
    const deep = "<".repeat(12) + "b>".repeat(12) + PAYLOAD;
    expect(reference(deep).out).toBe("img src=x onerror=alert(1)>"); // 끝까지 벗기면 이 글자만 남는다
    expect(sanitizeChatMessage(deep)).toBe(sanitizeUserInput(deep)); // 상한을 넘었으니 엄격 함수 결과
    expect(sanitizeChatMessage(deep)).toBe("b>b>b>b>b>b>b>b>b>b>b>img src=x onerror=alert(1)>");
  });

  it("평범한 입력은 두 번 훑고 끝난다 — 상한은 그보다 커야 하고 폴백을 타지 않는다", () => {
    // 태그가 하나 있는 입력은 한 번 지우고 한 번 확인하면 끝난다(2회).
    expect(CHAT_SANITIZE_MAX_PASSES).toBeGreaterThan(2);
    const input = "x < 5 <img src=x onerror=alert(1)> y > 3";
    expect(sanitizeChatMessage(input)).toBe("x < 5  y > 3");
    expect(sanitizeChatMessage(input)).not.toBe(sanitizeUserInput(input));
  });
});

// ── 성능: 입력 길이에 비례해서만 늘어난다 (#523 리뷰) ─────────────────────────────
//
// `/api/chat` 의 `chatRequestSchema` 검증은 인증과 속도 제한보다 먼저 돈다. 그래서 이 함수가 느려지면
// 로그인하지 않은 요청으로 서버 CPU 를 점유할 수 있다. "바뀌지 않을 때까지 반복" + `[^>]*` 정규식은
// 한 겹씩만 벗겨지는 입력에서 (회차 수) × (회차당 이차 시간) 이 되어 10,000자(상한)에서 9~14초가 걸렸다.
// 아래 입력은 그 모양들이다. 선형 스캐너와 반복 상한이 있으면 몇 ms 안에 끝난다.
describe("sanitizeChatMessage — 최악 모양 입력도 제때 끝난다 (#523)", () => {
  const CAP = 10000; // chatRequestSchema.message 의 상한
  const BUDGET_MS = 300; // 선형 구현은 몇 ms. 이전 구현은 이 입력들에서 9~14초였다.
  const IMG_TAIL = "img src=x onerror=alert(1)>";

  const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  const layers = (L: number) => "<".repeat(L) + "b>".repeat(L);
  /** 겹 L 개 + 닫히지 않는 꼬리 반복. 한 겹씩만 벗겨지고 매번 꼬리를 다시 훑게 만드는 모양. */
  const nestedThenTail = (L: number, unit: string) => layers(L) + rep(unit, CAP - 3 * L);

  const WORST: Array<[label: string, input: string]> = [
    ["겹 1111 + `<script ` 꼬리", nestedThenTail(1111, "<script ")],
    ["겹 1111 + `<a` 꼬리", nestedThenTail(1111, "<a")],
    ["겹 1111 + `<img ` 꼬리", nestedThenTail(1111, "<img ")],
    ["겹 800 + `<script ` 꼬리", nestedThenTail(800, "<script ")],
    ["겹 1500 + `<script ` 꼬리", nestedThenTail(1500, "<script ")],
    ["겹 1111 + `<!` 꼬리", nestedThenTail(1111, "<!")],
    ["겹 1111 + `</` 꼬리", nestedThenTail(1111, "</")],
    ["닫히지 않는 `<script>` 반복", rep("<script>", CAP)],
    ["닫히지 않는 `<form ` 반복(`>` 없음)", rep("<form ", CAP)],
    ["닫히지 않는 `<a ` 반복", rep("<a ", CAP)],
    ["`<<b>` 반복 뒤 img", rep("<<b>", CAP - IMG_TAIL.length) + IMG_TAIL],
    ["여는 꺾쇠만 반복", "<".repeat(CAP)],
    ["`<a<a<a...` 이름 이어붙임", rep("<a", CAP)],
    ["겹 + 닫는 태그가 없는 `<form>` 반복", layers(1000) + rep("<form>", CAP - 3000)],
    ["섞은 모양(겹 + 여러 꼬리)", layers(500) + rep("<script ", 3000) + rep("<a ", 3000) + rep("<img ", 1500)],
  ];

  it.each(WORST)("%s", (_label, input) => {
    expect(input.length).toBeLessThanOrEqual(CAP);
    const started = performance.now();
    const out = sanitizeChatMessage(input);
    const elapsed = performance.now() - started;

    expect(elapsed, `${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
    expect(out).not.toMatch(TAG_LIKE);
    expect(elementCount(out)).toBe(0);
  });

  // 선형인지 직접 본다. 스키마 상한의 10배(100,000자)에서도 같은 예산 안에 끝난다. `[^>]*` 로 끝까지 훑는
  // 정규식이 한 회차에 이차 시간이면 이 크기에서 수 초가 된다. 아래 모양은 겹이 3 이하라 엄격 함수 폴백을
  // 타지 않는다(폴백인 `sanitizeUserInput` 은 이전부터 있던 정규식이라 별개로 이차다).
  const LINEAR_N = 100_000;
  it.each([
    ["닫히지 않는 `<script>` 반복", rep("<script>", LINEAR_N)],
    ["닫히지 않는 `<form ` 반복(`>` 없음)", rep("<form ", LINEAR_N)],
    ["닫히지 않는 `<img ` 반복 + 끝에 `>` 하나", rep("<img ", LINEAR_N) + ">"],
    ["`<a<` 이어붙임", rep("<a<", LINEAR_N)],
    ["겹 3 + `<script ` 꼬리", layers(3) + rep("<script ", LINEAR_N)],
    ["겹 3 + `<a ` 꼬리 + 끝에 `>` 하나", layers(3) + rep("<a ", LINEAR_N) + ">"],
    ["여는 꺾쇠만 반복", "<".repeat(LINEAR_N)],
  ])("%s — 100,000자", (_label, input) => {
    const started = performance.now();
    const out = sanitizeChatMessage(input);
    const elapsed = performance.now() - started;

    expect(elapsed, `${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
    // `TAG_LIKE` 정규식 자체가 이 크기에서 이차라서, 같은 뜻을 선형으로 확인한다:
    // 마지막 `>` 앞에 태그 시작(`<` + 영문자, `/`, `!`, `?`)이 없다.
    const lastGt = out.lastIndexOf(">");
    expect(lastGt === -1 || !/<[A-Za-z/!?]/.test(out.slice(0, lastGt))).toBe(true);
  });
});

describe("sanitizeChatMessage — 참조 구현(정규식 반복)과 같은 출력 (#523)", () => {
  const tokens = [
    "<", ">", "/", "!", "?", "-", " ", "\n", "=", '"', "5", "x", "b", "a",
    "<script>", "</script>", "<script ", "</script ", "<SCRIPT>", "</SCRIPT>", "<style>", "</style>",
    "<form>", "</form>", "<form ", "<textarea>", "</textarea>", "<select>", "</select>", "<button>", "</button>",
    "<iframe ", "<object>", "</object>", "<embed>", "<applet>", "<noscript>", "</noscript>",
    "<img ", "<img>", "<svg ", "<math>", "<link>", "<meta>", "<base>", "<b>", "</b>", "<a ", "</a>",
    "<!--", "-->", "<![CDATA[", "<?", "<<", ">>", "<scr", "ipt>", "<i", "mg ", "script", "img", "onerror=1",
    "&lt;", "&gt;", "&amp;", "<_x>", "<img_x>", "<script-x>", "<scripts>", "<ſcript>",
  ];

  it("무작위 입력 6000건에서 출력이 같다 (상한 안은 참조와, 상한 밖은 엄격 함수와)", () => {
    let seed = 20261003;
    const next = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let withinCap = 0;
    for (let n = 0; n < 6000; n++) {
      const length = 1 + Math.floor(next() * 16);
      let input = "";
      for (let i = 0; i < length; i++) input += tokens[Math.floor(next() * tokens.length)];

      if (reference(input).changes + 1 <= CHAT_SANITIZE_MAX_PASSES) withinCap++;
      expect(sanitizeChatMessage(input), JSON.stringify(input)).toBe(expectedChatMessage(input));
    }
    // 무작위 입력은 거의 다 상한 안이다. 상한 밖(폴백)은 위의 겹 모양 테스트가 직접 지킨다.
    expect(withinCap).toBeGreaterThan(5000);
  });
});

describe("sanitizeChatMessage — 알려진 한계 (#523)", () => {
  // 태그 모양인 학생 입력은 계속 지워진다. 렌더가 모두 텍스트 이스케이프라도 `<` 뒤가 영문자인
  // 입력은 "태그처럼 생긴 것"과 구분할 수 없어서 방어선 쪽을 우선했다.
  it("`<NA>`, `<b>` 처럼 태그 모양인 입력은 지워진다", () => {
    expect(sanitizeChatMessage("값이 <NA> 인 행을 세어 주세요")).toBe("값이  인 행을 세어 주세요");
    expect(sanitizeChatMessage("<b>굵게</b> 쓰면 되나요")).toBe("굵게 쓰면 되나요");
  });

  it("`<` 바로 뒤가 영문자인 부등호는 다음 `>` 까지 지워진다", () => {
    expect(sanitizeChatMessage("x<y and y>z")).toBe("xz");
  });

  it("지워지는 범위는 줄바꿈을 넘는다 — 여러 줄 코드의 가운데가 통째로 사라진다", () => {
    // `[^>]*` 는 줄바꿈도 건너뛴다. `a[i]<b[i]` 의 `<b` 에서 시작해 맨 끝줄의 `>` 까지 세 줄이 지워진다.
    const code = "for i in range(n):\n    if a[i]<b[i]:\n        cnt+=1\n# 결과가 > 10 이면?";
    expect(sanitizeChatMessage(code)).toBe("for i in range(n):\n    if a[i] 10 이면?");
  });

  it("엔티티가 섞인 입력에서는 이전 함수가 우연히 막던 모양이 해제 뒤에 태그가 된다", () => {
    // 이전 함수는 `<&lt;b>...>` 를 `<[^>]*>` 한 덩어리로 지웠다. 새 함수는 `<` 뒤가 `&` 라 태그로 보지 않고
    // 지나간 뒤 엔티티를 해제해서 `<` 가 생긴다. `&lt;img ...&gt;` 만으로도 이전 함수에서 같은 결과가 나오므로
    // 새로 열린 공격 방법은 아니다(해제는 두 함수 모두 태그 제거 뒤). 실행되지 않는 이유는 텍스트 렌더다.
    // 해제를 태그 제거 앞으로 옮기면 이 입력도 지워지는데, 그건 이 PR 이 바꾸지 않는 소유자 결정이다.
    expect(sanitizeUserInput("<&lt;b>img src=x onerror=alert(1)>")).toBe("img src=x onerror=alert(1)>");
    expect(sanitizeChatMessage("<&lt;b>img src=x onerror=alert(1)>")).toBe("<<b>img src=x onerror=alert(1)>");
    expect(sanitizeUserInput("&lt;img src=x onerror=alert(1)&gt;")).toBe("<img src=x onerror=alert(1)>");
    expect(sanitizeChatMessage("&lt;img src=x onerror=alert(1)&gt;")).toBe("<img src=x onerror=alert(1)>");
  });
});

// ── 데이터 분석 시험에서 학생이 쓸 만한 입력 (#523 리뷰 측정) ──────────────────────
//
// 보존되는 것과 변질되는 것을 표로 못박는다. 변질되는 쪽은 "그렇게 동작한다" 는 기록이지 바람직하다는
// 뜻이 아니다. 채팅 메시지에서 태그 제거를 하지 않는 안(B)을 고르면 변질 쪽이 모두 사라진다.
describe("sanitizeChatMessage — 데이터 분석 입력 (#523)", () => {
  it.each([
    "income < 3000 이고 age > 40 인 행만 남겨 주세요",
    "p < 0.05 이므로 유의, 다음은 x>5",
    "df[df['x'] < 5] 와 df[df['y'] > 2]",
    "p<.05 이고 F>3",
    "df[(df.age<30) & (df.income>5000)]",
    "df.query('age<30 and income>5000')",
    "a<>b",
    "x<5\n그러면 이렇게 되고\n결과는 y>3",
    "p<0.05",
    "x<=5",
    "x -> y",
    "x => y",
    "x <- 5",
  ])("보존: %s", (input) => {
    expect(sanitizeChatMessage(input)).toBe(input);
  });

  it.each([
    ["IQR 이상치 관용구", "mask = ((df[c]<lo)|(df[c]>hi))", "mask = ((df[c]hi))"],
    ["`<` 뒤가 영문자인 비교 두 개", "a<b 이면 b>c", "ac"],
    ["`<y ... >z`", "x<y and y>z", "xz"],
    ["제네릭 `List<int>`", "List<int> 를 쓰나요", "List 를 쓰나요"],
    ["pandas info() 출력", "<class 'pandas.core.frame.DataFrame'>", ""],
    ["matplotlib 반환값", "<AxesSubplot:>", ""],
    ["결측값 표시 `<NA>`", "값이 <NA> 인 행", "값이  인 행"],
    ["트레이스백 파일명", 'File "<ipython-input-3-abc>", line 1', 'File "", line 1'],
  ])("변질: %s", (_label, input, expected) => {
    expect(sanitizeChatMessage(input)).toBe(expected);
    // 이전 함수도 같은 입력을 같게(또는 더 많이) 지운다 — 이 PR 이 새로 만든 손실이 아니다.
    expect(sanitizeUserInput(input).length).toBeLessThanOrEqual(expected.length);
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
