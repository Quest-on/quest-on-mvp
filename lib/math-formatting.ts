import katex from "katex";

export function normalizeMathDelimiters(content: string): string {
  if (!content) return "";

  return content
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expression: string) => {
      return `$$${expression.trim()}$$`;
    })
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expression: string) => {
      return `$${expression.trim()}$`;
    });
}

function renderMathExpression(
  expression: string,
  displayMode: boolean
): string {
  return katex.renderToString(expression.trim(), {
    displayMode,
    throwOnError: false,
    output: "html",
    strict: "ignore",
    trust: false,
  });
}

export function containsMathSyntax(content: string): boolean {
  if (!content) return false;
  return (
    /\$\$[\s\S]+?\$\$/.test(content) ||
    /(?<!\$)\$[^$\n]+?\$(?!\$)/.test(content) ||
    /\\\((?:.|\n)*?\\\)/.test(content) ||
    /\\\[(?:.|\n)*?\\\]/.test(content)
  );
}

export function renderMathInHtml(content: string): string {
  if (!content) return "";

  const normalized = normalizeMathDelimiters(content);
  const blockPlaceholders: string[] = [];

  const withBlockMathPlaceholders = normalized.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (_, expression: string) => {
      const placeholder = `__QA_BLOCK_MATH_${blockPlaceholders.length}__`;
      blockPlaceholders.push(
        `<div class="qa-math-block my-3 overflow-x-auto">${renderMathExpression(
          expression,
          true
        )}</div>`
      );
      return placeholder;
    }
  );

  const withInlineMath = withBlockMathPlaceholders.replace(
    /(?<!\$)\$([^$\n]+?)\$(?!\$)/g,
    (_, expression: string) => renderMathExpression(expression, false)
  );

  // 치환값은 반드시 함수로 넘긴다. 문자열로 넘기면 `$&`, `` $` ``, `$'` 같은 특수 패턴이
  // 해석되어 수식 렌더 결과(오류 span 의 title 속성 등) 안으로 문서의 다른 부분이 다시
  // 들어온다. 이 함수는 정화(DOMPurify) 뒤에 불리므로 그렇게 들어온 문자열은 정화를 거치지 않는다.
  return blockPlaceholders.reduce((result, html, index) => {
    return result.replace(`__QA_BLOCK_MATH_${index}__`, () => html);
  }, withInlineMath);
}
