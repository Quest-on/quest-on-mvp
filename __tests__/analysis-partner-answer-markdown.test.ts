/**
 * 잘린 분석 파트너 답의 블록 닫기를 실제 화면의 마크다운 해석으로 확인한다 (#564 후속)
 *
 * 답은 `AIMessageRenderer` 가 그린다: 수식 구분자 정리(`normalizeMathDelimiters`) 뒤 react-markdown 에 remark-gfm,
 * remark-math 를 붙여 읽는다. 여기서는 같은 길로 읽은 트리(mdast)를 받아, 잘렸다는 안내가 맨 바깥의 마지막 문단(바로
 * 앞은 구분선)으로 남는지 본다. 안내가 코드 블록, 수식 블록, 목록 안으로 들어가면 실패한다.
 *
 * 리뷰에서 찾은 경우(목록 안에 들여 연 코드 블록과 수식 블록, ~~~ 코드 블록, 글 속 코드의 $$ 와 줄 가운데의 $$)를
 * 하나씩 보고, 흔한 답 모양을 무작위로 짜 여러 자리에서 자른 글도 같은 기준으로 본다.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { readFileSync } from "node:fs";
import path from "node:path";
import koExam from "../messages/ko/exam.json";
import { finishAnalysisPartnerAnswer } from "@/lib/analysis-partner-answer";
import { normalizeMathDelimiters } from "@/lib/math-formatting";

const NOTICE = koExam.analysis.chatAnswer.truncated;
const TAIL = `\n\n---\n\n${NOTICE}`;

/** 이 테스트에 필요한 만큼의 mdast 노드 모양. */
type MdNode = { type: string; value?: string; lang?: string | null; children?: MdNode[] };

/** `AIMessageRenderer` 와 같은 길로 읽은 트리. react-markdown 안에서 remark 단계가 끝난 트리를 붙잡는다. */
function parseLikeRenderer(markdown: string): MdNode {
  const captured: { tree?: MdNode } = {};
  const capture = () => (tree: unknown) => {
    captured.tree = tree as MdNode;
  };
  renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkMath, capture], children: normalizeMathDelimiters(markdown) })
  );
  if (!captured.tree) throw new Error("markdown tree was not captured");
  return captured.tree;
}

function textOf(node: MdNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOf).join("");
}

/** `type` 노드를 그 조상 목록과 함께 모두 찾는다(조상은 바깥부터). */
function findAll(node: MdNode, type: string, ancestors: MdNode[] = []): Array<{ node: MdNode; ancestors: MdNode[] }> {
  const here = node.type === type ? [{ node, ancestors }] : [];
  return [...here, ...(node.children ?? []).flatMap((child) => findAll(child, type, [...ancestors, node]))];
}

function finish(text: string): string {
  const answer = finishAnalysisPartnerAnswer({ text, status: "incomplete", incompleteReason: "max_output_tokens", language: "ko" });
  expect(answer.truncated).toBe(true);
  return answer.content;
}

/** 안내가 맨 바깥의 마지막 문단이고 바로 앞이 구분선인가. 코드나 수식 노드에 안내가 들어가지 않았는가. */
function expectNoticeOnTop(content: string, label = content): MdNode {
  const tree = parseLikeRenderer(content);
  const top = tree.children ?? [];
  expect(top.at(-1)?.type, label).toBe("paragraph");
  expect(textOf(top.at(-1)!), label).toBe(NOTICE);
  expect(top.at(-2)?.type, label).toBe("thematicBreak");
  for (const type of ["code", "math", "inlineCode", "inlineMath", "html"]) {
    for (const { node } of findAll(tree, type)) expect(node.value ?? "", label).not.toContain(NOTICE);
  }
  return tree;
}

/** 자른 글에 붙는 것이 정확히 `closer`(없으면 빈 글)와 안내인지 보고, 화면 트리를 돌려준다. */
function expectClosedWith(text: string, closer: string): MdNode {
  const content = finish(text);
  expect(content).toBe(`${text.trimEnd()}${closer ? `\n${closer}` : ""}${TAIL}`);
  return expectNoticeOnTop(content);
}

describe("시험이 화면과 같은 마크다운 해석을 쓴다", () => {
  it("AIMessageRenderer 는 수식 구분자를 정리한 뒤 remark-gfm, remark-math 로 읽는다", () => {
    const source = readFileSync(path.join(process.cwd(), "components/chat/AIMessageRenderer.tsx"), "utf8");
    expect(source).toContain("remarkPlugins={[remarkGfm, remarkMath]}");
    expect(source).toContain("normalizeMathDelimiters(content)");
  });
});

describe("잘린 답의 코드 블록과 수식 블록 닫기 (#564 후속)", () => {
  it("맨 바깥 코드 블록은 0열의 같은 표시로 닫는다", () => {
    const tree = expectClosedWith("이렇게 계산합니다.\n\n```python\nimport pandas as pd\ndf = pd.read_csv('/mnt/data/sales.csv')", "```");
    const [code] = findAll(tree, "code");
    expect(code.node.lang).toBe("python");
    expect(code.node.value).toBe("import pandas as pd\ndf = pd.read_csv('/mnt/data/sales.csv')");
  });

  it("목록 안에 들여 연 코드 블록은 같은 들여쓰기로 닫아 목록 안에서 닫히고, 안내는 목록 밖 맨 바깥에 온다", () => {
    const text = "1. 데이터를 불러옵니다.\n   ```python\n   df = pd.read_csv('/mnt/data/sales.csv')\n   df.groupby('region')['sales'].";
    const tree = expectClosedWith(text, "   ```");
    const [code] = findAll(tree, "code");
    expect(code.ancestors.map((n) => n.type)).toContain("listItem");
    expect(code.node.value).toBe("df = pd.read_csv('/mnt/data/sales.csv')\ndf.groupby('region')['sales'].");
  });

  it("목록 표시 바로 뒤에서 연 코드 블록과 중첩 목록의 코드 블록도 그 항목의 내용 열로 닫는다", () => {
    expectClosedWith("1. 첫 단계\n2. ```python\n   x = df['sales'].mean()", "   ```");
    const nested = expectClosedWith("1. 단계\n   - 세부 단계\n     ```python\n     x = 1", "     ```");
    const [code] = findAll(nested, "code");
    expect(code.ancestors.filter((n) => n.type === "listItem")).toHaveLength(2);
    expect(code.node.value).toBe("x = 1");
  });

  it("~~~ 코드 블록도 세고, 그 안의 ``` 줄로는 닫히지 않는다", () => {
    const tree = expectClosedWith("~~~python\nprint('```')\n```\nx = 1", "~~~");
    expect(findAll(tree, "code")[0].node.value).toBe("print('```')\n```\nx = 1");
  });

  it("여는 표시가 길면 같은 길이로 닫고, 짧은 표시는 안의 글이다", () => {
    const tree = expectClosedWith("````markdown\n```python\nx = 1\n```\n이어서 쓰는", "````");
    expect(findAll(tree, "code")[0].node.value).toBe("```python\nx = 1\n```\n이어서 쓰는");
    // 긴 표시는 짧게 연 블록을 닫는다.
    expectClosedWith("```python\nx = 1\n`````\n\n결과를 보면", "");
  });

  it("맨 바깥 수식 블록과 목록 안 수식 블록을 같은 들여쓰기로 닫는다", () => {
    const top = expectClosedWith("표준편차는 다음과 같습니다.\n\n$$\n\\sigma = \\sqrt{\\frac{1}{N}", "$$");
    expect(findAll(top, "math")[0].node.value).toBe("\\sigma = \\sqrt{\\frac{1}{N}");
    const listed = expectClosedWith("1. 표준편차:\n   $$\n   \\sigma = \\sqrt{\\frac{1}{N}", "   $$");
    const [math] = findAll(listed, "math");
    expect(math.ancestors.map((n) => n.type)).toContain("listItem");
    expect(math.node.value).toBe("\\sigma = \\sqrt{\\frac{1}{N}");
  });

  it("글 속 코드의 $$, 줄 가운데의 $$, 한 줄 안에서 닫힌 $$ 는 수식 블록이 아니어서 닫는 줄을 붙이지 않는다", () => {
    expectClosedWith("수식 블록은 `$$` 로 감쌉니다. 예를 들어 표준편차는", "");
    expectClosedWith("평균은 $$\\bar{x} = \\frac{1}{n}", "");
    expectClosedWith("$$\\bar{x}$$ 는 표본 평균이고, 분산은", "");
    expectClosedWith("코드 블록은 ``` 세 개로 열고 $$ 는", "");
  });

  it("코드 블록 안의 $$ 줄, 수식 블록 안의 ``` 줄은 세지 않는다", () => {
    expectClosedWith("```python\nprint('$$')\n$$\nx = 1", "```");
    expectClosedWith("$$\n\\text{```}\n```\nx", "$$");
  });

  it("백틱으로 연 줄의 나머지에 백틱이 있으면 글 속 코드라 블록이 아니다", () => {
    expectClosedWith("```js``` 는 한 줄 코드이고 그다음", "");
  });

  it("닫힌 블록 뒤 글에서 잘렸으면 닫는 줄 없이 안내만 붙인다", () => {
    expectClosedWith("```python\nx = 1\n```\n\n결과는 다음과 같", "");
    expectClosedWith("1. 단계\n   ```python\n   x = 1\n   ```\n2. 다음 단계에서", "");
  });

  it("인용 안의 코드 블록은 인용 표시를 붙여 닫는다", () => {
    const tree = expectClosedWith("> 참고 코드:\n> ```python\n> x = 1", "> ```");
    expect(findAll(tree, "code")[0].ancestors.map((n) => n.type)).toContain("blockquote");
  });

  it("여는 줄에서 잘렸거나 줄바꿈이 CRLF 여도 닫는다", () => {
    expectClosedWith("결과:\n\n```pyth", "```");
    const content = finish("```python\r\nx = 1\r\n");
    expect(content).toBe(`\`\`\`python\r\nx = 1\n\`\`\`${TAIL}`);
    expectNoticeOnTop(content);
  });

  it("목록 항목보다 덜 들여쓴 줄이 오면 항목과 블록이 함께 끝난 것으로 본다(화면 해석과 같게)", () => {
    // 코드 줄을 들여쓰지 않으면 화면은 거기서 목록과 코드 블록을 끝내고, 그 뒤 들여쓴 ``` 를 새 블록의 시작으로 읽는다.
    expectClosedWith("1. 코드:\n   ```python\nimport pandas as pd\n   ```\n\n결과를 보면", "   ```");
  });
});

/** 같은 결과를 내는 작은 의사 난수(mulberry32). 실패를 다시 볼 수 있게 씨앗을 고정한다. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXT_LINES = [
  "지역별 평균 매출을 비교합니다.",
  "`df.describe()` 로 요약 통계를 봅니다.",
  "수식 블록은 `$$` 로 감쌉니다.",
  "표본 평균은 $\\bar{x}$ 이고 분산은 $$\\sigma^2$$ 입니다.",
  "값 $$ 기호를 줄 가운데에 씁니다.",
  "코드 블록은 ``` 세 개로 엽니다.",
];
const CODE_LINES = [
  "import pandas as pd",
  "df = pd.read_csv('/mnt/data/sales.csv')",
  "print(df.groupby('region')['sales'].mean())",
  "# 주석의 $$ 는 세지 않는다",
  "s = '```'",
  "$$",
];
const MATH_LINES = ["\\sigma = \\sqrt{\\frac{1}{N}\\sum_{i=1}^{N}(x_i - \\mu)^2}", "\\bar{x} = \\frac{1}{n}\\sum x_i", "\\text{```}"];

/** 흔한 답 모양(문단, 코드 블록, 수식 블록, 목록 안 블록, 중첩 목록, 인용, 표, 제목)을 이어 붙인 답. */
function sampleAnswer(next: () => number): string {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const some = <T,>(items: readonly T[], min: number, max: number): T[] =>
    Array.from({ length: min + Math.floor(next() * (max - min + 1)) }, () => pick(items));
  const fence = (indent: string): string[] => {
    const char = pick(["`", "`", "~"]);
    const size = pick([3, 3, 4]);
    // 짧은 ``` 줄(긴 백틱 블록 안)과 다른 문자의 ``` 줄(~~~ 블록 안)은 블록을 닫지 않는 안의 글이다.
    const inner = (char === "`" && size === 4) || char === "~" ? ["```"] : [];
    const body = [...some(CODE_LINES, 1, 3), ...inner];
    return [`${indent}${char.repeat(size)}${pick(["python", "", "text"])}`, ...body.map((l) => indent + l), indent + char.repeat(size)];
  };
  const math = (indent: string): string[] => [`${indent}$$`, ...some(MATH_LINES, 1, 2).map((l) => indent + l), `${indent}$$`];
  const blockAt = (indent: string): string[] => (next() < 0.65 ? fence(indent) : math(indent));
  const list = (): string[] => {
    const ordered = next() < 0.5;
    const lines: string[] = [];
    const items = 1 + Math.floor(next() * 3);
    for (let n = 1; n <= items; n++) {
      const marker = ordered ? `${n}. ` : "- ";
      const content = " ".repeat(marker.length);
      const roll = next();
      if (roll < 0.2) {
        // 목록 표시 바로 뒤에서 블록을 연다.
        const [open, ...rest] = blockAt(content);
        lines.push(marker + open.trimStart(), ...rest);
      } else {
        lines.push(marker + pick(TEXT_LINES));
        if (roll < 0.7) lines.push(...(next() < 0.3 ? [""] : []), ...blockAt(content));
        if (next() < 0.3) lines.push(`${content}- ${pick(TEXT_LINES)}`, ...blockAt(`${content}  `));
      }
    }
    return lines;
  };
  const blocks: Array<() => string[]> = [
    () => some(TEXT_LINES, 1, 2),
    () => fence(""),
    () => math(""),
    list,
    list,
    () => ["> " + pick(TEXT_LINES), ...fence("").map((l) => `> ${l}`)],
    () => ["| 지역 | 매출 |", "| --- | --- |", "| 서울 | 120 |"],
    () => ["## 결과"],
  ];
  return some(blocks, 2, 5)
    .map((block) => block().join("\n"))
    .join("\n\n");
}

describe("흔한 답 모양을 여러 자리에서 잘라도 안내는 맨 바깥에 온다 (#564 후속)", () => {
  it("무작위로 짠 답 60개를 줄 끝과 무작위 자리에서 자른다", () => {
    const next = random(564);
    let checked = 0;
    for (let doc = 0; doc < 60; doc++) {
      const answer = sampleAnswer(next);
      const cuts = new Set<number>();
      for (let i = answer.indexOf("\n"); i !== -1; i = answer.indexOf("\n", i + 1)) cuts.add(i);
      cuts.add(answer.length);
      for (let k = 0; k < 12; k++) cuts.add(1 + Math.floor(next() * answer.length));
      for (const at of cuts) {
        const text = answer.slice(0, at);
        if (text.trim() === "") continue;
        const content = finish(text);
        expect(content.startsWith(text.trimEnd()), JSON.stringify(text)).toBe(true);
        expectNoticeOnTop(content, JSON.stringify(text));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
