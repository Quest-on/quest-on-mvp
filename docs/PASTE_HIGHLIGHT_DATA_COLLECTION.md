# 답안 하이라이트를 위한 데이터 수집 방안

## 현재 상황

현재 `paste_logs` 테이블에 저장되는 데이터:
- `length`: 붙여넣기한 텍스트의 길이
- `timestamp`: 붙여넣기한 시간
- `is_internal`, `suspicious`: 플래그

**문제**: 답안의 특정 부분을 하이라이트할 수 없음

## 하이라이트를 위해 필요한 데이터

### 방법 1: 붙여넣기한 텍스트 내용 저장 (추천)

**장점:**
- 구현이 상대적으로 간단
- 답안에서 해당 텍스트를 직접 찾아 하이라이트 가능

**단점:**
- 같은 텍스트가 여러 번 나타날 경우 정확한 위치 파악 어려움
- 긴 텍스트의 경우 저장 공간 필요

**필요한 데이터:**
```typescript
{
  pasted_text: string;        // 붙여넣기한 텍스트 내용
  pasted_text_hash?: string;  // 해시값 (중복 체크용, 선택사항)
}
```

### 방법 2: 답안 내 위치 정보 저장

**장점:**
- 정확한 위치 파악 가능
- 텍스트 내용 저장 불필요 (공간 절약)

**단점:**
- TipTap 에디터에서 커서 위치를 정확히 추적하기 어려울 수 있음
- HTML 구조로 인해 텍스트 위치와 실제 표시 위치가 다를 수 있음

**필요한 데이터:**
```typescript
{
  answer_length_before: number;  // 붙여넣기 전 답안의 텍스트 길이
  answer_length_after: number;   // 붙여넣기 후 답안의 텍스트 길이
  cursor_position?: number;      // 커서 위치 (가능하다면)
}
```

### 방법 3: 하이브리드 접근 (가장 정확)

**장점:**
- 방법 1과 2의 장점 결합
- 가장 정확한 하이라이트 가능

**단점:**
- 저장 공간이 더 필요
- 구현 복잡도 증가

**필요한 데이터:**
```typescript
{
  pasted_text: string;           // 붙여넣기한 텍스트
  answer_length_before: number;  // 붙여넣기 전 답안 길이
  answer_snapshot_before?: string; // 붙여넣기 전 답안 스냅샷 (선택사항)
}
```

## 추천 구현 방안

### 단계 1: 데이터베이스 스키마 수정

```sql
-- paste_logs 테이블에 컬럼 추가
ALTER TABLE paste_logs 
ADD COLUMN pasted_text TEXT,
ADD COLUMN answer_length_before INTEGER,
ADD COLUMN answer_text_before TEXT; -- 선택사항: 정확도를 높이기 위해
```

### 단계 2: 클라이언트에서 추가 정보 수집

**TipTap 에디터를 사용하는 경우:**

```typescript
const handlePaste = useCallback(
  async (e: ClipboardEvent, editor: Editor) => {
    const clipboard = e.clipboardData;
    if (!clipboard) return;

    // 내부 복사 판정은 형식(application/x-queston-internal)이 있는지만 보지 않는다.
    // 형식 값과 표식 문자에 담긴 시험 세션 범위가 이 화면의 범위와 같을 때만 내부다(#560).
    // scope = useInternalCopyScope() ?? STANDALONE_INTERNAL_COPY_SCOPE
    const isInternal = isInternalCopyFor(clipboard, scope); // lib/internal-copy.ts
    // 판정한 뒤 표식 문자를 지운다(#555).
    const pastedText = stripInternalCopyMarkers(clipboard.getData("text/plain"));

    // 현재 답안 상태 가져오기
    const currentAnswer = editor.getHTML();
    const currentText = editor.getText(); // HTML이 아닌 순수 텍스트
    const answerLengthBefore = currentText.length;

    // 커서 위치 가져오기 (가능하다면)
    const { from } = editor.state.selection;
    const cursorPosition = from;

    // 서버로 전송
    await fetch("/api/log/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        length: pastedText.length,
        pasted_text: pastedText,              // 새로 추가
        answer_length_before: answerLengthBefore, // 새로 추가
        answer_text_before: currentText,      // 선택사항
        cursor_position: cursorPosition,      // 선택사항
        isInternal,
        ts: Date.now(),
        examCode,
        questionId: exam?.questions[currentQuestion]?.id,
        sessionId: sessionId,
      }),
    });
  },
  [examCode, exam, currentQuestion, sessionId]
);
```

### 단계 3: 답안에서 하이라이트

**방법 A: 텍스트 매칭 (간단)**

```typescript
function highlightPastedContent(
  answer: string,
  pasteLogs: PasteLog[]
): string {
  if (!answer || pasteLogs.length === 0) return answer;

  const suspiciousPastes = pasteLogs.filter((log) => log.suspicious);
  if (suspiciousPastes.length === 0) return answer;

  let highlightedAnswer = answer;

  // 각 붙여넣기한 텍스트를 답안에서 찾아 하이라이트
  suspiciousPastes.forEach((log) => {
    if (log.pasted_text) {
      // HTML 태그를 제거한 순수 텍스트에서 찾기
      const textContent = stripHtml(answer);
      const index = textContent.indexOf(log.pasted_text);
      
      if (index !== -1) {
        // HTML에서 해당 위치를 찾아 하이라이트 태그 추가
        // (복잡하지만 가능)
      }
    }
  });

  return highlightedAnswer;
}
```

**방법 B: 위치 기반 하이라이트 (더 정확)**

```typescript
function highlightPastedContent(
  answer: string,
  pasteLogs: PasteLog[]
): string {
  if (!answer || pasteLogs.length === 0) return answer;

  const suspiciousPastes = pasteLogs
    .filter((log) => log.suspicious && log.answer_length_before !== null)
    .sort((a, b) => a.answer_length_before! - b.answer_length_before!);

  if (suspiciousPastes.length === 0) return answer;

  // 텍스트 길이를 기준으로 위치 추정
  const textContent = stripHtml(answer);
  let highlightedAnswer = answer;
  let offset = 0; // HTML 태그로 인한 오프셋

  suspiciousPastes.forEach((log) => {
    const startIndex = log.answer_length_before!;
    const endIndex = startIndex + (log.pasted_text?.length || log.length);
    
    // HTML에서 해당 위치를 찾아 하이라이트
    // (구현 복잡도 높음)
  });

  return highlightedAnswer;
}
```

## 구현 우선순위

1. **1단계 (간단)**: `pasted_text`만 저장하고 텍스트 매칭으로 하이라이트
   - 구현 시간: 1-2시간
   - 정확도: 중간 (중복 텍스트 문제)

2. **2단계 (권장)**: `pasted_text` + `answer_length_before` 저장
   - 구현 시간: 2-3시간
   - 정확도: 높음

3. **3단계 (완벽)**: 전체 스냅샷 저장
   - 구현 시간: 4-6시간
   - 정확도: 매우 높음
   - 저장 공간: 많음

## 보안 고려사항

- `pasted_text`에 민감한 정보가 포함될 수 있으므로 암호화 고려
- 개인정보 보호를 위해 일정 기간 후 삭제 정책 필요

## 성능 고려사항

- 긴 텍스트의 경우 해시값만 저장하고 실제 텍스트는 별도 저장
- 하이라이트 계산은 클라이언트 사이드에서 수행 (서버 부하 감소)

