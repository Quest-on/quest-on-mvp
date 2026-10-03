/**
 * 답안 칸 끌어다 놓기(drop) 기록용 순수 로직(#561).
 *
 * 붙여넣기는 paste 이벤트에서 글을 직접 넣고 기록하지만, 끌어다 놓기는 놓는 위치를 스크립트로 알 수
 * 없다(textarea 안의 좌표 → 글자 위치를 알려 주는 API 가 브라우저마다 없다). 그래서 넣기는 브라우저에
 * 맡기고, 넣기 직전 값과 직후 값을 비교해 들어온 구간을 찾는다.
 *
 * React/UI 의존성이 없어 단위 테스트가 가능하다.
 */

// ── 시험 화면 안에서 시작한 끌기 ─────────────────────────────────────
//
// 붙여넣기는 클립보드의 내부 표식(형식·표식 문자)으로 시험 화면 안 복사를 가른다. 끌기에는 그 표식을
// 실을 수 없다. DataTransfer 에 사용자 정의 형식을 쓰면 WebKit 은 drop 에서 그 형식을 보여 주지 않고,
// text/plain 없이 쓰면 끌기 자체가 실패한다(Chromium·Firefox·WebKit 에서 확인). 표식 문자를 text/plain 에
// 넣으면 브라우저가 그 문자까지 답안에 넣는다. 그래서 같은 문서 안에서 시작한 끌기는 메모리에만 적어 둔다.
// 다른 창·탭에서 끌어온 글은 여기에 없으므로 외부로 판정된다.

let activeInternalDrag: string | null = null;

/** 줄바꿈(CRLF/LF)과 목록 들여쓰기는 브라우저 직렬화마다 달라서 비교에서 뺀다. */
function normalizeDragText(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 시험 화면 안(문제 본문, AI 대화, 평가 기준, 답안 칸)에서 글을 끌기 시작했다. */
export function startInternalDrag(text: string): void {
  const normalized = normalizeDragText(text);
  activeInternalDrag = normalized ? normalized : null;
}

export function endInternalDrag(): void {
  activeInternalDrag = null;
}

/**
 * 놓인 글이 이 문서 안에서 시작한 끌기의 글인가.
 * 끌기 시작 때 적어 둔 글과 같아야 한다 — dragend 를 놓쳐 표시가 남아 있어도 다른 글을 내부로
 * 오인하지 않게 한다.
 */
export function isInternalDrag(droppedText: string): boolean {
  return activeInternalDrag !== null && activeInternalDrag === normalizeDragText(droppedText);
}

// ── 들어온 구간 찾기 ─────────────────────────────────────────────

export interface InsertedRange {
  start: number;
  end: number;
}

/**
 * `before` 에 글이 들어와 `after` 가 됐을 때 들어온 구간(`after` 기준).
 *
 * @param selectionEnd 넣은 직후 textarea 의 selectionEnd. Chromium 은 넣은 글 전체를, Firefox 는 넣은 글
 *   끝 커서를 남겨서 위치를 정할 수 있다. WebKit 은 input 시점에 0 이라 쓸 수 없다.
 * @param hint 브라우저가 넣으려던 글(beforeinput 의 data, 없으면 drop 의 text/plain).
 *
 * 같은 글자가 이어진 곳에 넣으면 위치가 하나로 정해지지 않는다("abc" 에 "bx" 를 1 에 넣은 것과 "xb" 를
 * 2 에 넣은 것은 둘 다 "abxbc"). 그때는 커서, 단서 글 순서로 고른다.
 */
export function locateInsertedText(
  before: string,
  after: string,
  selectionEnd: number,
  hint: string,
): InsertedRange | null {
  const added = after.length - before.length;
  if (added <= 0) return null;

  let prefix = 0;
  while (prefix < before.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }

  // 순수 삽입이면 가능한 시작 위치는 [lo, hi] 전부이고, 어느 것을 골라도 `after` 가 된다.
  const lo = before.length - suffix;
  const hi = prefix;
  if (lo <= hi) {
    const bySelection = selectionEnd - added;
    if (bySelection >= lo && bySelection <= hi) return { start: bySelection, end: selectionEnd };

    // textarea 는 줄바꿈을 LF 로 바꿔 넣는다.
    const normalizedHint = hint.replace(/\r\n?/g, "\n");
    if (normalizedHint.length === added) {
      for (let start = lo; start <= hi; start++) {
        if (after.startsWith(normalizedHint, start)) return { start, end: start + added };
      }
    }
    return { start: hi, end: hi + added };
  }

  // 순수 삽입이 아니다(넣으면서 옆 글자도 바뀐 경우). 바뀐 구간 전체를 기록한다.
  const end = after.length - Math.min(suffix, before.length - prefix);
  return { start: prefix, end };
}
