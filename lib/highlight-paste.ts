/**
 * 강사 채점 화면의 학생 답안 렌더링용 순수 유틸.
 *
 * 보안 핵심: 학생 답안은 신뢰할 수 없는 입력이다. 이 모듈은 답안을 항상 HTML 이스케이프한
 * 뒤에만 붙여넣기 하이라이트(`<mark>`)를 얹으므로, 답안에 `<script>`·`<img onerror>` 같은
 * 마크업이 들어와도 강사 브라우저에서 실행되지 않는다(저장형 XSS 차단).
 *
 * React/UI 의존성이 없어 단위 테스트가 가능하도록 컴포넌트에서 분리했다.
 */

export interface PasteLog {
  id: string;
  question_id: string;
  length: number;
  pasted_text?: string;
  paste_start?: number;
  paste_end?: number;
  answer_length_before?: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  created_at: string;
}

// HTML 태그를 제거하고 순수 텍스트만 반환
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const FLEXIBLE_WHITESPACE_PATTERN = "(?:\\s|&nbsp;|<br\\s*/?>)*";

// 원본 텍스트 기준으로 특수문자 이스케이프를 먼저 수행한 뒤,
// HTML 이스케이프와 공백/줄바꿈 유연 매칭 패턴을 결합한다.
function buildFlexibleHtmlRegexFromRawText(rawText: string): RegExp | null {
  const normalized = rawText.replace(/\r\n?/g, "\n");
  const segments = normalized.match(/\s+|[^\s]+/g);
  if (!segments || segments.length === 0) return null;

  const pattern = segments
    .map((segment) => {
      if (/^\s+$/.test(segment)) return FLEXIBLE_WHITESPACE_PATTERN;
      const regexEscaped = escapeRegExp(segment);
      return escapeHtml(regexEscaped);
    })
    .join("");

  if (!pattern) return null;
  return new RegExp(pattern, "g");
}

function sortLogsByLengthDesc(logs: PasteLog[]): PasteLog[] {
  return [...logs].sort(
    (a, b) => (b.pasted_text?.length ?? 0) - (a.pasted_text?.length ?? 0)
  );
}

// 텍스트를 HTML로 변환 (이스케이프 + 줄바꿈 처리)
export function textToHtml(text: string): string {
  if (!text) return "";
  // HTML 특수문자 이스케이프
  return escapeHtml(text).replace(/\n/g, "<br>"); // 줄바꿈을 <br>로 변환
}

function applyPositionFallback(
  htmlAnswer: string,
  log: PasteLog,
  colorClass: string
): string {
  const { paste_start, paste_end } = log;

  if (
    paste_start === undefined ||
    paste_start === null ||
    paste_end === undefined ||
    paste_end === null ||
    paste_end <= paste_start
  ) return htmlAnswer;

  const plainText = stripHtml(htmlAnswer);

  if (paste_start >= plainText.length || paste_end > plainText.length) return htmlAnswer;

  const targetText = plainText.substring(paste_start, paste_end);
  if (!targetText.trim()) return htmlAnswer;

  const escapedTarget = escapeRegExp(escapeHtml(targetText));
  const targetRegex = new RegExp(escapedTarget, "g");

  return htmlAnswer.replace(
    targetRegex,
    `<mark class="${colorClass} opacity-60 px-1 rounded" title="붙여넣기 후 수정됨">$&</mark>` // title은 HTML 속성이라 t() 적용 불가
  );
}

// 답안에서 복사-붙여넣기한 부분을 하이라이트
export function highlightPastedContent(answer: string, pasteLogs: PasteLog[]): string {
  if (!answer) return "";

  // 학생 답안은 신뢰할 수 없는 입력이므로 항상 HTML 이스케이프한 뒤 paste 하이라이트를
  // 적용한다. (과거엔 답안에 태그가 보이면 원문을 그대로 렌더 → 강사 채점 화면 저장형 XSS
  //  였다. 이제 legacy HTML 답안도 이스케이프되어 태그가 텍스트로 안전하게 표시된다.)
  // 텍스트를 HTML로 변환 (이스케이프 + 줄바꿈)
  let htmlAnswer = textToHtml(answer);

  // 붙여넣기가 있으면 하이라이트 적용
  if (pasteLogs && pasteLogs.length > 0) {
    // 내부 복사 - 파란색 (먼저 필터링하여 외부 복사와 구분)
    const internalPastes = sortLogsByLengthDesc(
      pasteLogs.filter((log) => log.is_internal === true && log.pasted_text)
    );

    // 외부 복사 (의심스러운 붙여넣기) - 빨간색 (내부 복사가 아닌 것만)
    const externalPastes = sortLogsByLengthDesc(
      pasteLogs.filter(
        (log) => log.is_internal !== true && log.suspicious && log.pasted_text
      )
    );

    // 내부 복사 하이라이트 (파란색) - 외부 복사와 동일한 로직, 색상만 다름
    for (const log of internalPastes) {
      const pastedText = log.pasted_text!;
      const regex = buildFlexibleHtmlRegexFromRawText(pastedText);
      const beforeLength = htmlAnswer.length;

      if (regex) {
        // 이미 하이라이트되지 않은 부분만 매칭
        const parts = htmlAnswer.split(/<mark[^>]*>[\s\S]*?<\/mark>/g);
        const markers = htmlAnswer.match(/<mark[^>]*>[\s\S]*?<\/mark>/g) || [];

        // 각 부분에서 내부 복사 텍스트 찾기
        let newHtmlAnswer = "";
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const highlightedPart = part.replace(
            regex,
            `<mark class="bg-blue-200 text-blue-900 font-semibold px-1 rounded">$&</mark>`
          );
          newHtmlAnswer += highlightedPart;
          if (i < markers.length) newHtmlAnswer += markers[i];
        }
        htmlAnswer = newHtmlAnswer;
      }

      // Fallback: if regex didn't match (answer length unchanged), try position-based
      if (htmlAnswer.length === beforeLength) {
        htmlAnswer = applyPositionFallback(htmlAnswer, log, "bg-blue-100 text-blue-800");
      }
    }

    // 외부 복사 하이라이트 (빨간색) - 내부 복사와 동일한 로직, 색상만 다름
    for (const log of externalPastes) {
      const pastedText = log.pasted_text!;
      const regex = buildFlexibleHtmlRegexFromRawText(pastedText);
      const beforeLength = htmlAnswer.length;

      if (regex) {
        // 이미 하이라이트되지 않은 부분만 매칭
        const parts = htmlAnswer.split(/<mark[^>]*>[\s\S]*?<\/mark>/g);
        const markers = htmlAnswer.match(/<mark[^>]*>[\s\S]*?<\/mark>/g) || [];

        // 각 부분에서 외부 복사 텍스트 찾기
        let newHtmlAnswer = "";
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const highlightedPart = part.replace(
            regex,
            `<mark class="bg-red-200 text-red-900 font-semibold px-1 rounded">$&</mark>`
          );
          newHtmlAnswer += highlightedPart;
          if (i < markers.length) newHtmlAnswer += markers[i];
        }
        htmlAnswer = newHtmlAnswer;
      }

      // Fallback: if regex didn't match (answer length unchanged), try position-based
      if (htmlAnswer.length === beforeLength) {
        htmlAnswer = applyPositionFallback(htmlAnswer, log, "bg-red-100 text-red-800");
      }
    }
  }

  return htmlAnswer;
}
