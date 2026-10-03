/**
 * 시험 화면 안 복사 표식(#560).
 *
 * 시험 응시 화면에서 복사한 글에는 보이지 않는 표식 문자(text/plain)와 사용자 정의 형식
 * (`application/x-queston-internal`)을 붙이고, 답안 칸 붙여넣기는 표식이 있으면 내부 복사(파란색,
 * 의심 아님)로 기록한다.
 *
 * 표식에는 그 시험 세션을 가리키는 값(범위)을 담고, 붙여넣기 쪽은 자기 범위와 같은 표식만 내부로
 * 인정한다. 과제 AI 대화·시험 리포트 같은 시험 밖 화면은 표식을 붙이지 않고, 다른 시험 세션의 표식은
 * 범위가 달라서, 그런 글을 시험 답안에 붙이면 외부 붙여넣기로 남는다.
 *
 * 브라우저에서 만드는 값이라 보안 경계는 아니다. 다른 화면에서 온 글이 내부 복사로 섞이지 않게 한다.
 *
 * React/UI 의존성이 없어 단위 테스트가 가능하다.
 */

export const INTERNAL_COPY_MIME_TYPE = "application/x-queston-internal";

/**
 * 세션 범위 없이 렌더된 답안 칸·`CopyProtector` 가 쓰는 범위(단독 렌더, 테스트).
 * 시험 응시 화면은 세션 범위를 주므로 이 범위의 표식은 실제 시험에서 내부로 인정되지 않는다.
 */
export const STANDALONE_INTERNAL_COPY_SCOPE = "";

// 시작 표식: ZWSP + U+E0001 + 범위(태그 문자 U+E0020~U+E007E 로 바꾼 것) + ZWSP. 끝 표식: ZWSP + U+E0002 + ZWSP.
// 범위가 빈 시작 표식은 #560 이전 형식(ZWSP + U+E0001 + ZWSP)과 같다.
const START_MARKER_PATTERN = /\u200B\u{E0001}([\u{E0020}-\u{E007E}]*)\u200B/gu;
const END_MARKER_PATTERN = /\u200B\u{E0002}\u200B/gu;
const END_MARKER = "\u200B\u{E0002}\u200B";
const TAG_OFFSET = 0xe0000;

/** 세션 id → 범위(FNV-1a 32bit, 16진수 8자리). 세션 id 원문은 클립보드에 싣지 않는다. */
export function internalCopyScope(sessionId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sessionId.length; i++) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function encodeScope(scope: string): string {
  return Array.from(scope, (ch) => String.fromCodePoint(TAG_OFFSET + ch.charCodeAt(0))).join("");
}

function decodeScope(tags: string): string {
  return Array.from(tags, (ch) => String.fromCharCode(ch.codePointAt(0)! - TAG_OFFSET)).join("");
}

/** 복사한 글을 이 범위의 표식으로 감싼다(text/plain 용). */
export function wrapInternalCopy(text: string, scope: string): string {
  return "\u200B\u{E0001}" + encodeScope(scope) + "\u200B" + text + END_MARKER;
}

/** 사용자 정의 형식에 싣는 값. */
export function internalCopyMimeValue(scope: string): string {
  return JSON.stringify({ scope });
}

function scopeOfMimeValue(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object") {
      const scope = (parsed as { scope?: unknown }).scope;
      if (typeof scope === "string") return scope;
    }
  } catch {
    // #560 이전 값("1", "true")이거나 알 수 없는 값이다.
  }
  return null;
}

/**
 * 클립보드(또는 끌기) 데이터가 이 범위의 시험 화면에서 복사한 것인가.
 * 형식 값이나 표식 문자 중 하나라도 범위가 같으면 내부다. 범위 없는 #560 이전 표식은 세션 범위와 다르다.
 */
export function isInternalCopyFor(
  data: Pick<DataTransfer, "types" | "getData">,
  scope: string,
): boolean {
  if (
    data.types.includes(INTERNAL_COPY_MIME_TYPE) &&
    scopeOfMimeValue(data.getData(INTERNAL_COPY_MIME_TYPE)) === scope
  ) {
    return true;
  }
  for (const match of data.getData("text/plain").matchAll(START_MARKER_PATTERN)) {
    if (decodeScope(match[1]) === scope) return true;
  }
  return false;
}

/**
 * 표식 문자를 걷어 낸다. 범위와 상관없이(다른 세션, #560 이전 형식 포함) 지운다.
 * 붙여넣기와 끌어다 놓기가 같이 쓴다(#555). 판정(`isInternalCopyFor`)은 지우기 전에 한다.
 */
export function stripInternalCopyMarkers(text: string): string {
  return text
    .replace(START_MARKER_PATTERN, "")
    .replace(END_MARKER_PATTERN, "")
    // #560 이전 CopyProtector 표식(폭 없는 공백 3개). 고치기 전 화면에서 복사해 클립보드에 남은 글에 있다.
    // 판정에는 쓰지 않는다(범위가 없고, 폭 없는 공백만으로 내부라고 보면 바깥 글을 오인할 수 있다).
    .replace(/\u200B\u200B\u200B/gu, "");
}
