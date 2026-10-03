/**
 * 복사 감지 버그 수정 시뮬레이션 테스트
 *
 * 버그 1: 외부 복사 오탐지 — MIME 타입 이중 감지 추가
 * 버그 2: 하이라이트 미작동 — truncation suffix 제거 + position fallback
 *
 * 버그 1 의 판정은 실제 코드(`lib/internal-copy.ts` 의 `isInternalCopyFor`)로 확인한다. 예전에는 이 파일이
 * 옛 규칙(형식이나 폭 없는 공백 표식만 있으면 내부)을 따로 구현해 테스트해서, 코드가 #560 으로 세션 범위를
 * 보게 바뀐 뒤에도 옛 규칙을 지키고 있었다.
 */
import {
  INTERNAL_COPY_MIME_TYPE,
  internalCopyMimeValue,
  internalCopyScope,
  isInternalCopyFor,
  wrapInternalCopy,
} from "@/lib/internal-copy";

// ============================================================
// 1) 순수 로직 추출 (컴포넌트 외부에서 단위 테스트 가능하도록)
// ============================================================

// --- 클립보드 흉내 (answer-textarea.tsx 판정은 lib/internal-copy 의 실제 함수를 쓴다) ---
interface MockClipboard {
  types: string[];
  getData: (type: string) => string;
}

/** 이 시험 세션의 범위. 답안 칸은 같은 범위의 형식·표식만 내부 복사로 인정한다(#560). */
const SCOPE = internalCopyScope("session-under-test");
const OTHER_SCOPE = internalCopyScope("other-session");

function mockClipboard(text: string, mime?: string): MockClipboard {
  const types = mime === undefined ? ["text/plain"] : ["text/plain", INTERNAL_COPY_MIME_TYPE];
  return {
    types,
    getData: (type) => (type === "text/plain" ? text : type === INTERNAL_COPY_MIME_TYPE ? (mime ?? "") : ""),
  };
}

// --- paste/route.ts 로직 ---
function truncatePasteText(
  pasted_text: string | null,
  maxLen = 200
): string | null {
  return pasted_text ? pasted_text.slice(0, maxLen) : null;
}

// --- FinalAnswerCard.tsx 로직 ---
interface PasteLog {
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

function textToHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

function cleanPastedText(text: string): string {
  return text.replace(/\.\.\.\[truncated\]$/, "");
}

function applyTextHighlight(
  htmlAnswer: string,
  pastedText: string,
  colorClass: string
): string {
  const escapedText = textToHtml(pastedText);
  const regex = new RegExp(
    escapedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g"
  );
  const parts = htmlAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
  const markers = htmlAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    result += parts[i].replace(
      regex,
      `<mark class="${colorClass}">${escapedText}</mark>`
    );
    if (i < markers.length) result += markers[i];
  }
  return result;
}

function applyPositionHighlight(
  htmlAnswer: string,
  answer: string,
  log: PasteLog,
  colorClass: string
): string {
  if (
    log.paste_start == null ||
    log.paste_end == null ||
    log.paste_start >= log.paste_end ||
    log.paste_end > answer.length
  )
    return htmlAnswer;

  const segment = answer.substring(log.paste_start, log.paste_end);
  const escapedSegment = textToHtml(segment);
  const regex = new RegExp(
    escapedSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g"
  );

  const parts = htmlAnswer.split(/<mark[^>]*>.*?<\/mark>/g);
  const markers = htmlAnswer.match(/<mark[^>]*>.*?<\/mark>/g) || [];
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    result += parts[i].replace(
      regex,
      `<mark class="${colorClass}">${escapedSegment}</mark>`
    );
    if (i < markers.length) result += markers[i];
  }
  return result;
}

function highlightPastedContent(
  answer: string,
  pasteLogs: PasteLog[]
): string {
  if (!answer) return "";

  const BLUE_CLASS = "bg-blue-200 text-blue-900 font-semibold px-1 rounded";
  const RED_CLASS = "bg-red-200 text-red-900 font-semibold px-1 rounded";

  const isHtml = /<[^>]+>/.test(answer);

  if (!isHtml) {
    let htmlAnswer = textToHtml(answer);

    if (pasteLogs && pasteLogs.length > 0) {
      const internalPastes = pasteLogs.filter(
        (log) => log.is_internal === true && log.pasted_text
      );
      const externalPastes = pasteLogs.filter(
        (log) => log.is_internal !== true && log.suspicious && log.pasted_text
      );

      for (const log of internalPastes) {
        const pastedText = cleanPastedText(log.pasted_text!);
        const before = htmlAnswer;
        htmlAnswer = applyTextHighlight(htmlAnswer, pastedText, BLUE_CLASS);
        if (htmlAnswer === before) {
          htmlAnswer = applyPositionHighlight(
            htmlAnswer,
            answer,
            log,
            BLUE_CLASS
          );
        }
      }

      for (const log of externalPastes) {
        const pastedText = cleanPastedText(log.pasted_text!);
        const before = htmlAnswer;
        htmlAnswer = applyTextHighlight(htmlAnswer, pastedText, RED_CLASS);
        if (htmlAnswer === before) {
          htmlAnswer = applyPositionHighlight(
            htmlAnswer,
            answer,
            log,
            RED_CLASS
          );
        }
      }
    }

    return htmlAnswer;
  }

  return answer;
}

// ============================================================
// 2) 헬퍼
// ============================================================

function makePasteLog(overrides: Partial<PasteLog>): PasteLog {
  return {
    id: "log-1",
    question_id: "q-1",
    length: 50,
    is_internal: false,
    suspicious: true,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// 3) 테스트
// ============================================================

describe("버그 1: 외부 복사 오탐지 수정 — 형식·표식 이중 감지(세션 범위, #560)", () => {
  test("CopyProtector 의 형식만 있을 때(표식 문자 없음) → 같은 세션 범위면 내부", () => {
    // 브라우저 확장이 표식 문자를 지웠지만 형식은 남은 경우
    const clipboard = mockClipboard("문제에서 복사한 텍스트", internalCopyMimeValue(SCOPE));
    expect(isInternalCopyFor(clipboard, SCOPE)).toBe(true);
  });

  test("형식만 있어도 범위가 다르거나 #560 이전 값(\"true\")이면 외부", () => {
    expect(isInternalCopyFor(mockClipboard("다른 세션 글", internalCopyMimeValue(OTHER_SCOPE)), SCOPE)).toBe(false);
    expect(isInternalCopyFor(mockClipboard("옛 화면 글", "true"), SCOPE)).toBe(false);
  });

  test("표식 문자만 있을 때 → 같은 세션 범위면 내부", () => {
    expect(isInternalCopyFor(mockClipboard(wrapInternalCopy("답안 텍스트", SCOPE)), SCOPE)).toBe(true);
    expect(isInternalCopyFor(mockClipboard(wrapInternalCopy("답안 텍스트", OTHER_SCOPE)), SCOPE)).toBe(false);
  });

  test("형식 + 표식 둘 다 있을 때 → 내부로 판별", () => {
    const clipboard = mockClipboard(wrapInternalCopy("답안 텍스트", SCOPE), internalCopyMimeValue(SCOPE));
    expect(isInternalCopyFor(clipboard, SCOPE)).toBe(true);
  });

  test("옛 CopyProtector 표식(폭 없는 공백 3개)만 있으면 외부(판정에 쓰지 않는다)", () => {
    const clipboard = mockClipboard("\u200B\u200B\u200B답안 텍스트\u200B\u200B\u200B");
    expect(isInternalCopyFor(clipboard, SCOPE)).toBe(false);
  });

  test("형식도 표식도 없을 때 → 외부로 판별", () => {
    expect(isInternalCopyFor(mockClipboard("외부에서 복사한 텍스트"), SCOPE)).toBe(false);
  });

  test("Grammarly 등 확장이 text만 주입 → 외부로 판별", () => {
    const clipboard: MockClipboard = {
      types: ["text/plain", "text/html"],
      getData: () => "autocorrected text",
    };
    expect(isInternalCopyFor(clipboard, SCOPE)).toBe(false);
  });

  test("한국어 IME에서 발생한 paste — 형식 없음 → 외부로 판별", () => {
    expect(isInternalCopyFor(mockClipboard("가"), SCOPE)).toBe(false);
  });
});

describe("버그 2-A: paste/route.ts truncation suffix 제거", () => {
  test("200자 이하 → 원본 그대로 저장", () => {
    const text = "짧은 텍스트";
    expect(truncatePasteText(text)).toBe(text);
  });

  test("200자 초과 → 200자까지만 저장, suffix 없음", () => {
    const longText = "가".repeat(300);
    const result = truncatePasteText(longText);
    expect(result).toHaveLength(200);
    expect(result).toBe("가".repeat(200));
    expect(result).not.toContain("...[truncated]");
  });

  test("정확히 200자 → 원본 그대로", () => {
    const text = "A".repeat(200);
    expect(truncatePasteText(text)).toBe(text);
    expect(truncatePasteText(text)).toHaveLength(200);
  });

  test("null → null 반환", () => {
    expect(truncatePasteText(null)).toBeNull();
  });

  test("빈 문자열 → falsy이므로 null 반환 (route.ts의 pasted_text ? ... : null)", () => {
    expect(truncatePasteText("")).toBeNull();
  });
});

describe("버그 2-B: FinalAnswerCard 하이라이트 — cleanPastedText", () => {
  test("...[truncated] suffix가 있는 기존 DB 데이터 정리", () => {
    const dbText = "첫 200자 내용...[truncated]";
    expect(cleanPastedText(dbText)).toBe("첫 200자 내용");
  });

  test("suffix 없는 정상 데이터 → 변경 없음", () => {
    expect(cleanPastedText("정상 텍스트")).toBe("정상 텍스트");
  });

  test("중간에 ...[truncated] 가 있으면 제거하지 않음 (끝에만 제거)", () => {
    const text = "앞...[truncated]뒤";
    expect(cleanPastedText(text)).toBe(text);
  });
});

describe("버그 2-C: 하이라이트 — 정상 텍스트 매칭", () => {
  test("짧은 외부 paste → 빨간색 하이라이트", () => {
    const answer = "나는 답안을 작성했다. 외부에서 복사한 내용이 있다.";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "외부에서 복사한 내용",
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-red-200");
    expect(result).toContain("외부에서 복사한 내용");
    expect(result).toContain("<mark");
  });

  test("짧은 내부 paste → 파란색 하이라이트", () => {
    const answer = "문제 내용을 복사한 부분과 직접 작성한 부분";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "문제 내용을 복사한 부분",
        is_internal: true,
        suspicious: false,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-blue-200");
    expect(result).toContain("문제 내용을 복사한 부분");
  });

  test("paste 로그 없으면 → 하이라이트 없음", () => {
    const answer = "순수한 답안";
    const result = highlightPastedContent(answer, []);
    expect(result).not.toContain("<mark");
    expect(result).toContain("순수한 답안");
  });
});

describe("버그 2-D: 하이라이트 — truncated 텍스트 매칭 (핵심 버그)", () => {
  test("기존 DB의 ...[truncated] suffix 데이터 → suffix 제거 후 매칭 성공", () => {
    // 시나리오: 기존 DB에 "...[truncated]" suffix가 붙어 저장된 데이터
    const fullPastedText = "가".repeat(250);
    const answer = `직접 쓴 부분. ${fullPastedText} 마무리.`;

    // 기존 DB에 저장된 형태 (수정 전 route.ts가 저장한 형태)
    const dbStoredText = "가".repeat(200) + "...[truncated]";

    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: dbStoredText,
        paste_start: 8, // "직접 쓴 부분. " 이후
        paste_end: 8 + 250,
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    // cleanPastedText로 suffix 제거 → "가" x 200 으로 매칭 시도
    // 답안에 "가" x 250이 있으므로 처음 200자 부분이 매칭됨
    expect(result).toContain("bg-red-200");
    expect(result).toContain("<mark");
  });

  test("수정 후 route.ts의 clean truncation → 매칭 성공", () => {
    // 시나리오: 수정된 route.ts가 suffix 없이 저장
    const fullPastedText = "나".repeat(250);
    const answer = `답안 시작. ${fullPastedText} 끝.`;

    // 수정된 route.ts가 저장하는 형태
    const storedText = truncatePasteText(fullPastedText)!;
    expect(storedText).toBe("나".repeat(200));
    expect(storedText).not.toContain("...[truncated]");

    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: storedText,
        paste_start: 6,
        paste_end: 6 + 250,
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-red-200");
    expect(result).toContain("<mark");
  });

  test("200자 이하 paste → 전체 매칭 (truncation 없음)", () => {
    const pastedText = "정상 길이 텍스트";
    const answer = `앞부분. ${pastedText} 뒷부분.`;

    const storedText = truncatePasteText(pastedText)!;
    expect(storedText).toBe(pastedText);

    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: storedText,
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-red-200");
    expect(result).toContain(textToHtml(pastedText));
  });
});

describe("버그 2-E: Position Fallback 하이라이트", () => {
  test("regex 매칭 실패 시 paste_start/paste_end로 fallback", () => {
    // 시나리오: pasted_text가 답안에서 매칭되지 않는 경우
    // (예: 학생이 paste 후 수정했지만 해당 영역은 남아있을 때)
    const answer = "AAAA 이것은 수정된 부분입니다 BBBB";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "이것은 원래 복사한 텍스트",  // 답안에 없음
        paste_start: 5,
        paste_end: 19,  // "이것은 수정된 부분입니다" 위치
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    // pasted_text로는 매칭 실패 → position fallback으로 "이것은 수정된 부분입니다" 하이라이트
    expect(result).toContain("bg-red-200");
    expect(result).toContain("<mark");
    expect(result).toContain("이것은 수정된 부분입니다");
  });

  test("paste_start/paste_end가 없으면 fallback 안 함", () => {
    const answer = "답안 텍스트";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "존재하지 않는 텍스트",
        paste_start: undefined,
        paste_end: undefined,
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    // regex 실패 + position 없음 → 하이라이트 없음
    expect(result).not.toContain("<mark");
  });

  test("paste_end가 답안 길이를 초과하면 fallback 안 함", () => {
    const answer = "짧은 답안";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "없는 텍스트",
        paste_start: 0,
        paste_end: 9999,  // 답안 길이 초과
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).not.toContain("<mark");
  });

  test("paste_start >= paste_end이면 fallback 안 함", () => {
    const answer = "답안 텍스트 입니다";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "없는 텍스트",
        paste_start: 10,
        paste_end: 5,  // 잘못된 범위
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).not.toContain("<mark");
  });
});

describe("복합 시나리오: 내부 + 외부 혼합", () => {
  test("같은 답안에 내부/외부 paste 모두 있을 때 각각 올바른 색상", () => {
    const answer = "직접 작성. 내부복사부분. 중간작성. 외부복사부분. 마무리.";
    const logs: PasteLog[] = [
      makePasteLog({
        id: "log-internal",
        pasted_text: "내부복사부분",
        is_internal: true,
        suspicious: false,
      }),
      makePasteLog({
        id: "log-external",
        pasted_text: "외부복사부분",
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-blue-200"); // 내부 = 파란색
    expect(result).toContain("bg-red-200"); // 외부 = 빨간색
    expect(result).toContain("내부복사부분");
    expect(result).toContain("외부복사부분");
  });

  test("내부 paste만 있을 때 → 빨간색 없음", () => {
    const answer = "문제에서 복사한 내용과 직접 작성한 내용";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "문제에서 복사한 내용",
        is_internal: true,
        suspicious: false,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-blue-200");
    expect(result).not.toContain("bg-red-200");
  });
});

describe("엣지 케이스", () => {
  test("빈 답안 → 빈 문자열 반환", () => {
    expect(highlightPastedContent("", [])).toBe("");
  });

  test("특수문자가 포함된 paste 텍스트 → regex 안전", () => {
    const answer = "답안에 function() { return true; } 가 포함됨";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "function() { return true; }",
        is_internal: false,
        suspicious: true,
      }),
    ];

    // regex 특수문자가 이스케이프되어 에러 없이 동작
    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-red-200");
  });

  test("줄바꿈이 포함된 paste → HTML 변환 후 매칭", () => {
    const answer = "첫째 줄\n둘째 줄\n셋째 줄";
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: "둘째 줄",
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-red-200");
    expect(result).toContain("<br>");
  });

  test("HTML 특수문자가 포함된 paste → textToHtml 변환 후 안전 매칭", () => {
    // 주의: answer에 <...> 패턴이 있으면 isHtml=true로 판별되어 HTML 분기를 탐
    // 여기서는 < > 를 HTML 태그가 아닌 형태로 사용
    const answer = '결과: 3 + 5 = 8 이고 "완료"라고 표시';
    const logs: PasteLog[] = [
      makePasteLog({
        pasted_text: '3 + 5 = 8 이고 "완료"',
        is_internal: false,
        suspicious: true,
      }),
    ];

    const result = highlightPastedContent(answer, logs);
    expect(result).toContain("bg-red-200");
    expect(result).toContain("&quot;완료&quot;");
  });
});
