/**
 * 도구 없는 분석 파트너 답의 마무리 (이슈 #564 4, 11번)
 *
 * `/api/chat` 은 분석 파트너에게만 답 길이 상한(`ANALYSIS_PARTNER_CHAT_MAX_OUTPUT_TOKENS`, #543)을 둔다. 상한에 걸리면
 * Responses API 가 `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"` 로 끝나고 본문은 중간까지만
 * 온다. 그대로 저장하면 학생은 답이 잘린 줄 모르고, 본문이 비면 사례형과 같은 영어 사과문이 저장됐다.
 *   - 상한에 걸려 잘린 답: 끝에 잘렸다는 안내를 붙인다. 잘린 자리가 코드 블록이나 수식 블록 안이면 먼저 닫는다
 *     (닫지 않으면 안내까지 코드나 수식으로 보인다).
 *   - 빈 답: 영어 사과문 대신 대화 언어의 안내를 저장한다.
 *   - 그 밖(정상 완료, 상한이 아닌 이유로 끝난 응답)은 본문 그대로다.
 * 문구는 메시지 파일(`messages/<언어>/exam.json` 의 `analysis.chatAnswer`)에 둔다. 저장되는 답의 일부라 화면 언어가 아니라
 * 대화 언어(시험 언어)로 고른다. 분석 파트너 v1 은 한국어 시험에서만 쓰이므로 지금은 늘 ko 다.
 *
 * 이 모듈은 순수하다.
 */

import koExam from "@/messages/ko/exam.json";
import enExam from "@/messages/en/exam.json";
import type { PromptLanguage } from "@/lib/prompts";

const NOTICES: Record<PromptLanguage, { truncated: string; empty: string }> = {
  ko: koExam.analysis.chatAnswer,
  en: enExam.analysis.chatAnswer,
};

export type AnalysisPartnerAnswer = {
  /** 저장하고 학생에게 돌려줄 답. */
  content: string;
  /** 출력 상한에 걸려 끝까지 쓰지 못한 답인가. */
  truncated: boolean;
};

/**
 * 닫히지 않은 채 끝난 코드 블록(``` 나 ~~~)이나 수식 블록($$). 답은 `AIMessageRenderer`(react-markdown + remark-gfm +
 * remark-math)로 그려지므로 그 파서(CommonMark, micromark)의 규칙을 줄 단위로 따른다.
 */
type OpenBlock = {
  /** 여는 표시의 문자(` ~ $)와 길이. 닫는 표시는 같은 문자로 이 길이 이상이어야 한다. */
  char: string;
  size: number;
  /** 여는 줄의 인용 표시(>) 수. 이보다 적은 줄이 오면 인용이 끝나 블록도 함께 끝난다. */
  quotes: number;
  /** 블록을 담은 목록 항목의 내용 열(목록 밖이면 0). 이보다 덜 들여쓴 줄이 오면 항목이 끝나 블록도 함께 끝난다. */
  col: number;
  /** 닫는 줄 앞에 붙일 글. 여는 줄의 인용 표시와, 목록 표시를 칸으로 바꾼 들여쓰기다. */
  prefix: string;
};

const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/;
// 수식 블록은 $ 두 개 이상으로 열고, 같은 줄 나머지에 $ 가 있으면 블록이 아니다(`$$x$$` 는 글 속 수식).
const MATH_OPEN = /^(\${2,})([^$]*)$/;
const LIST_MARKER = /^([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const THEMATIC_BREAK = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ATX_HEADING = /^#{1,6}(?:[ \t]|$)/;

/** `column` 열에서 시작하는 공백 글 `text` 뒤의 열. 탭은 4칸 단위로 펼친다. */
function advance(column: number, text: string): number {
  let at = column;
  for (const ch of text) at = ch === "\t" ? at + 4 - (at % 4) : at + 1;
  return at;
}

/** 줄 앞의 인용 표시(>)를 `max` 개까지 떼어 낸다. */
function stripQuotes(line: string, max: number): { quotes: number; prefix: string; rest: string } {
  let quotes = 0;
  let prefix = "";
  let rest = line;
  for (let m = /^ {0,3}>[ \t]?/.exec(rest); m && quotes < max; m = /^ {0,3}>[ \t]?/.exec(rest)) {
    quotes += 1;
    prefix += m[0];
    rest = rest.slice(m[0].length);
  }
  return { quotes, prefix, rest };
}

/** 줄 앞 공백의 너비와 그 뒤의 글. */
function splitIndent(text: string): { width: number; body: string } {
  const space = /^[ \t]*/.exec(text)?.[0] ?? "";
  return { width: advance(0, space), body: text.slice(space.length) };
}

/** 이 글(들여쓰기 뒤)이 코드 블록이나 수식 블록을 여는가. 백틱으로 연 줄의 나머지에 백틱이 있으면 글 속 코드다. */
function blockOpener(body: string): { char: string; size: number } | null {
  const fence = FENCE_OPEN.exec(body);
  if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) return { char: fence[1][0], size: fence[1].length };
  const math = MATH_OPEN.exec(body);
  return math ? { char: "$", size: math[1].length } : null;
}

// GFM 표의 구분 줄(| --- | :-: |). 끝의 공백 반복이 맞붙지 않게 쓴다(맞지 않는 긴 줄에서 길이의 제곱으로 돌지 않게).
const TABLE_DELIMITER = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*(?:\|[ \t]*)?$/;

/** GFM 표 줄의 칸 수. 맨 앞뒤의 | 는 칸을 나누지 않고 \| 는 글이다. */
function tableCells(row: string): number {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/).length;
}

/** 문단 글(머리 줄) 바로 다음의 이 줄이 표를 여는 구분 줄인가. | 가 있고 머리 줄과 칸 수가 같아야 한다(GFM). */
function isTableDelimiter(body: string, header: string): boolean {
  return body.includes("|") && TABLE_DELIMITER.test(body) && tableCells(body) === tableCells(header);
}

/** 열린 목록 항목 하나. 내용 열과 목록 종류(글머리 기호는 그 문자, 번호 목록은 번호 뒤의 `.` 이나 `)`). */
type ListItem = { col: number; kind: string };

/**
 * 문단 바로 다음 줄의 목록 표시가 새 목록을 시작해 문단을 끊을 수 있는가(CommonMark). 비어 있지 않은 항목이어야 하고,
 * 번호 목록이면 1 로 시작해야 한다. 그렇지 않은 줄(예: "3. ```", 빈 "-")은 앞 문단에 이어지는 글이다.
 */
function interruptsParagraph(marker: RegExpExecArray, body: string): boolean {
  if (body.slice(marker[0].length).trim() === "") return false;
  return /^\d/.test(marker[1]) ? /^1[.)]$/.test(marker[1]) : true;
}

/** 열린 블록을 닫는 줄인가. 같은 문자가 여는 표시 길이 이상 이어지고 그 뒤에 공백만 있다. */
function isCloser(body: string, block: OpenBlock): boolean {
  let n = 0;
  while (n < body.length && body[n] === block.char) n += 1;
  return n >= block.size && body.slice(n).trim() === "";
}

/**
 * 글 끝에서 열려 있는 코드 블록이나 수식 블록. 줄마다 인용 표시와 목록 항목(내용 열)을 따라가며 본다.
 *   - 여는 줄: 들여쓰기가 담은 목록 항목의 내용 열보다 4칸 이상 깊지 않다(깊으면 들여쓴 코드다). 목록 표시 바로 뒤에서
 *     열 수도 있다("1. ```python").
 *   - 블록 안의 줄: 같은 문자, 같거나 긴 표시로만 닫는다(코드 블록 안의 $$, 수식 블록 안의 ``` 는 세지 않는다). 담은
 *     목록 항목보다 덜 들여쓴 줄이나 인용 표시가 모자란 줄이 오면 그 항목, 인용과 함께 블록도 끝난다.
 *   - 글 속 수식($$x$$, `$$`)과 줄 가운데의 $$ 는 블록을 열지 않는다(블록은 줄 머리에서만 열린다).
 *   - 문단 바로 다음 줄의 목록 표시는 같은 목록의 다음 항목이거나 문단을 끊을 수 있는 새 목록(`interruptsParagraph`)일
 *     때만 목록이다. 아니면 문단에 이어지는 글이라 그 뒤 블록도 목록 밖에서 연 것으로 본다.
 *   - GFM 표의 줄은 문단이 아니다. 표 바로 다음 줄의 목록 표시는 번호와 관계없이 목록을 연다.
 * HTML 블록과 setext 제목 밑줄의 세부 규칙은 보지 않는다.
 */
function findOpenBlock(text: string): OpenBlock | null {
  const lists: ListItem[] = [];
  let quoteDepth = 0;
  let open: OpenBlock | null = null;
  let paragraph = false;
  // 바로 앞 줄이 같은 자리의 문단 글이면 그 글(표의 머리 줄 후보). 표 안에 있는가.
  let header: string | null = null;
  let table = false;
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (open) {
      const quoted = stripQuotes(line, open.quotes);
      const { width, body } = splitIndent(quoted.rest);
      const ended = quoted.quotes < open.quotes || (body !== "" && width < open.col);
      if (!ended) {
        if (width - open.col <= 3 && isCloser(body, open)) open = null;
        continue;
      }
      // 블록을 담은 인용이나 목록 항목이 끝나 블록도 함께 끝났다. 이 줄은 블록 밖에서 다시 읽는다.
      open = null;
    }

    const quoted = stripQuotes(line, Number.POSITIVE_INFINITY);
    if (quoted.quotes !== quoteDepth) {
      lists.length = 0;
      table = false;
      // 새 인용이 열리면 그 안에는 아직 문단이 없다(인용 표시는 앞 문단을 끊는다).
      if (quoted.quotes > quoteDepth) {
        paragraph = false;
        header = null;
      }
      quoteDepth = quoted.quotes;
    }
    const { width, body } = splitIndent(quoted.rest);
    if (body === "") {
      paragraph = false;
      header = null;
      table = false;
      continue;
    }
    const lead = THEMATIC_BREAK.test(body) ? null : LIST_MARKER.exec(body);
    // 바깥부터 보아 처음으로 이어지지 않는 항목(이 줄이 그 내용 열보다 덜 들여씀)의 목록이 같은 종류의 다음 항목을 받는다.
    const sibling = lead !== null && lists.find((item) => width < item.col)?.kind === lead[1].slice(-1);
    const listStart = lead !== null && (!paragraph || sibling || interruptsParagraph(lead, body));
    const blockStart = listStart || blockOpener(body) !== null || THEMATIC_BREAK.test(body) || ATX_HEADING.test(body);
    if (table) {
      // 표의 줄(빈 줄이나 블록을 여는 줄 전까지).
      if (!blockStart) continue;
      table = false;
    }
    if (paragraph && !blockStart) {
      // 문단에 이어지는 글. 덜 들여써도 이어지는 게으른 이어짐은 목록 항목을 끝내지 않고, 표의 머리 줄이 되지 못한다.
      const lazy = lists.length > 0 && width < lists[lists.length - 1].col;
      if (!lazy && header !== null && isTableDelimiter(body, header)) {
        table = true;
        paragraph = false;
        header = null;
      } else {
        header = lazy ? null : body;
      }
      continue;
    }
    while (lists.length > 0 && width < lists[lists.length - 1].col) lists.pop();

    let col = lists.length > 0 ? lists[lists.length - 1].col : 0;
    let column = width;
    let rest = body;
    while (column - col <= 3 && !THEMATIC_BREAK.test(rest)) {
      const marker = LIST_MARKER.exec(rest);
      if (!marker) break;
      const markerEnd = column + marker[1].length;
      const after = advance(markerEnd, marker[2]);
      // 표시 뒤가 비었거나(빈 항목) 5칸 이상 띄었으면(들여쓴 코드) 내용 열은 표시 다음 칸이고 이 줄에서 블록이 열리지 않는다.
      const plain = marker[2] !== "" && after - markerEnd <= 4;
      col = plain ? after : markerEnd + 1;
      lists.push({ col, kind: marker[1].slice(-1) });
      if (!plain) {
        rest = "";
        break;
      }
      column = after;
      rest = rest.slice(marker[0].length);
    }

    const opener = rest !== "" && column - col <= 3 ? blockOpener(rest) : null;
    if (opener) {
      open = { ...opener, quotes: quoted.quotes, col, prefix: quoted.prefix + " ".repeat(column) };
      paragraph = false;
      header = null;
      continue;
    }
    paragraph = rest !== "" && !THEMATIC_BREAK.test(rest) && !ATX_HEADING.test(rest);
    header = paragraph ? rest : null;
  }
  return open;
}

/**
 * 잘린 자리가 코드 블록이나 수식 블록 안이면 닫는다. 닫는 줄은 여는 줄과 같은 인용 표시, 들여쓰기, 문자, 길이다.
 * 목록 안에서 들여 연 블록을 0열 표시로 닫으면 목록이 끝나고 그 표시가 새 블록을 열어 안내까지 코드로 보인다(#564 후속).
 */
function closeOpenBlocks(text: string): string {
  const open = findOpenBlock(text);
  return open ? `${text}\n${open.prefix}${open.char.repeat(open.size)}` : text;
}

export function finishAnalysisPartnerAnswer(params: {
  /** 응답 본문(output_text 를 이은 것). */
  text: string;
  /** Responses API 응답의 status. */
  status?: string | null;
  /** Responses API 응답의 incomplete_details.reason. */
  incompleteReason?: string | null;
  /** 대화(시험) 언어. */
  language: PromptLanguage;
}): AnalysisPartnerAnswer {
  const notices = NOTICES[params.language] ?? NOTICES.ko;
  const truncated = params.status === "incomplete" && params.incompleteReason === "max_output_tokens";
  if (params.text.trim().length === 0) return { content: notices.empty, truncated };
  if (!truncated) return { content: params.text, truncated };
  return { content: `${closeOpenBlocks(params.text.trimEnd())}\n\n---\n\n${notices.truncated}`, truncated };
}
