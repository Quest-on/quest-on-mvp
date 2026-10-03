"use client";

/**
 * 분석 셀 코드의 문법 강조 (이슈 #564)
 *
 * `AnalysisTurnBlock` 이 코드 보기를 처음 펼칠 때만 동적 `import()` 로 받는다. 응시 화면과 채점 화면의 첫 로딩에
 * 하이라이터가 들어가지 않게 하려는 것이다. 정적으로 import 하지 않는다(`__tests__/exam-bundle-highlighter.test.ts`).
 *
 * 전체 Prism(refractor 언어 정의 수백 개) 대신 PrismLight 에 python 하나만 등록한다. 분석 셀은 python 만 실행한다.
 * 패키지 루트(`react-syntax-highlighter`)에서 가져오지 않는다. 루트는 전체 Prism 과 highlight.js 판을 함께 내보낸다.
 */

import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";

SyntaxHighlighter.registerLanguage("python", python);

export default function AnalysisCodeHighlighter({ code }: { code: string }) {
  return (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language="python"
      PreTag="div"
      className="!m-0 max-h-96 !rounded-none !bg-[#1e1e1e] text-xs"
      showLineNumbers
    >
      {code}
    </SyntaxHighlighter>
  );
}
