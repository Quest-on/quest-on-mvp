/**
 * /api/chat 의 q_idx(문항 배열 위치) 계산.
 *
 * q_idx 는 검증된 questionIdx 만 사용한다. 과거엔 questionIdx 가 없으면 questionId(UUID)를
 * `parseInt(String(id)) % 2147483647` 로 숫자화해 q_idx 로 썼는데, UUID 앞자리 숫자가 우연히
 * 다른 문항의 q_idx 와 충돌하면 A 문항 대화가 B 문항에 저장되는 데이터 오염을 유발했다.
 * UUID→숫자 폴백을 제거하고, questionIdx 가 없거나 유효하지 않으면 0 으로 폴백한다.
 */
export function resolveChatQIdx(questionIdx?: number | string | null): number {
  if (questionIdx !== undefined && questionIdx !== null) {
    const parsed = parseInt(String(questionIdx), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return 0;
}

/**
 * 서버가 로드한 원본 exam.questions 에서 해당 q_idx 문항의 ai_context(강사 채점 컨텍스트)를
 * 꺼낸다. ai_context 는 학생에게 내려주지 않으므로(민감 필드 스트립), 채팅 프롬프트 구성 시
 * 클라이언트 값 대신 이 서버 파생 값을 사용해야 한다. 없으면 undefined.
 */
export function extractQuestionAiContext(
  questions: unknown,
  qIdx: number
): string | undefined {
  if (!Array.isArray(questions)) return undefined;
  const q = questions[qIdx];
  if (!q || typeof q !== "object") return undefined;
  const ctx = (q as { ai_context?: unknown }).ai_context;
  return typeof ctx === "string" ? ctx : undefined;
}
