/**
 * 분석 실행(코드 인터프리터)의 상한과 시간 예산 (이슈 #545, #543)
 *
 * 숫자를 한곳에 둔다. 라우트, 셀 수집기, 클라이언트, 테스트가 같은 값을 읽는다.
 *
 * 근거
 *   - 스파이크(2026-10-03, artifacts/kim-exam/research/code-interpreter-spike.md) 실측: gpt-6.1-sol 한 턴 p50 32.8초,
 *     p95 54.5초, 최대 61.3초. 6턴 시나리오의 턴당 셀은 1~8개(평균 2개 남짓). 60초 한도는 1% 턴에서 넘었다.
 *   - `max_tool_calls` 는 code_interpreter 호출 수를 제한하지 않았다(1로 지정해도 5회 실행). 그래서 셀 수와
 *     경과 시간은 서버가 스트림에서 직접 센다.
 *   - #543 실측 출력 속도: gpt-6.1-sol 2,499토큰 45.2초(초당 약 55토큰), gpt-5.4 4,275토큰 58.7초(약 73토큰),
 *     gpt-6-sol 1,459토큰 14.9초(약 98토큰). 가장 느린 값(초당 55토큰)으로 역산한다.
 */

/** 한 턴에서 실행할 수 있는 코드 셀 수. 13번째 셀이 시작되면 스트림을 닫는다. */
export const ANALYSIS_MAX_CELLS_PER_TURN = 12;

/** 한 턴의 경과 시간 상한(요청 시작부터). 넘으면 스트림을 닫고 그 턴을 실패로 기록한다. */
export const ANALYSIS_TURN_BUDGET_MS = 240_000;

/**
 * 분석 라우트의 Vercel 함수 시간(`maxDuration`, `vercel.json`). 턴 예산 240초 뒤에 그림 저장, 파일 인용 내려받기,
 * 메시지 저장을 마칠 60초가 남는다.
 */
export const ANALYSIS_ROUTE_MAX_DURATION_SEC = 300;

/**
 * 스트림 뒤 작업(그림 저장, 파일 인용 그림 내려받기)의 마감(요청 시작부터). 이 뒤에는 그림을 버리고 메시지 저장과
 * ai_events 기록으로 넘어간다. 함수 시간(300초)까지 15초를 남긴다.
 */
export const ANALYSIS_FINALIZE_DEADLINE_MS = 285_000;

/** 파일 인용 그림을 내려받으려면 마감까지 이만큼은 남아 있어야 한다. */
export const CITED_FIGURES_MIN_REMAINING_MS = 20_000;

/**
 * 브라우저가 분석 턴 하나를 기다리는 시간. 서버 함수 시간보다 10초 길다. 서버가 저장을 마치기 전에 화면이 먼저
 * 끊기면 학생이 같은 요청을 다시 보내 턴이 두 번 생긴다.
 */
export const ANALYSIS_CLIENT_TIMEOUT_MS = (ANALYSIS_ROUTE_MAX_DURATION_SEC + 10) * 1000;

/** 출력 속도의 보수적 추정(초당 토큰). #543 실측에서 가장 느린 모델의 값이다. */
export const CONSERVATIVE_OUTPUT_TOKENS_PER_SEC = 55;

/**
 * 분석 턴에서 모델이 글자(코드, 추론, 답변)를 만드는 데 쓰는 시간의 비율. 나머지는 코드 실행 시간이다.
 * 스파이크 턴 타임라인에서 코드 실행과 출력 사이의 대기가 대략 절반이었다.
 */
export const ANALYSIS_GENERATION_SHARE = 0.5;

/** 분석 턴의 `max_output_tokens`. 240초 × 0.5 × 초당 55토큰 = 6,600. 코드 셀과 추론과 답변을 모두 포함한다. */
export const ANALYSIS_MAX_OUTPUT_TOKENS = Math.floor(
  (ANALYSIS_TURN_BUDGET_MS / 1000) * ANALYSIS_GENERATION_SHARE * CONSERVATIVE_OUTPUT_TOKENS_PER_SEC
);

/** `/api/chat` 의 함수 시간(`maxDuration`). 바뀌면 아래 상한도 같이 바뀐다. */
export const CHAT_ROUTE_MAX_DURATION_SEC = 60;

/** `/api/chat` 에서 모델 호출 밖에 쓰는 시간(자료 검색, 메시지 저장, 콜드 스타트)의 여유. */
export const CHAT_ROUTE_NON_GENERATION_SEC = 15;

/**
 * 도구 없는 분석 파트너(`/api/chat`)의 `max_output_tokens`. (60초 - 15초) × 초당 55토큰 = 2,475.
 * 사례형 경로에는 붙이지 않는다(사례형 요청 모양은 바뀌지 않는다).
 */
export const ANALYSIS_PARTNER_CHAT_MAX_OUTPUT_TOKENS = Math.floor(
  (CHAT_ROUTE_MAX_DURATION_SEC - CHAT_ROUTE_NON_GENERATION_SEC) * CONSERVATIVE_OUTPUT_TOKENS_PER_SEC
);

/** 셀 하나의 코드 저장 상한(글자). 넘으면 앞부분만 저장하고 잘렸다고 표시한다. */
export const CELL_CODE_MAX_CHARS = 20_000;

/** 셀 하나의 실행 로그 저장 상한(글자). 넘으면 앞부분만 저장하고 잘렸다고 표시한다. */
export const CELL_LOGS_MAX_CHARS = 4_000;

/** 그림 한 장의 저장 상한. 저장소 버킷 `analysis-outputs` 의 파일 크기 제한(10MB)과 같다. */
export const MAX_FIGURE_BYTES = 10 * 1024 * 1024;

/** 한 턴에서 저장하는 그림 수 상한(셀 출력과 파일 인용 합계). */
export const MAX_FIGURES_PER_TURN = 24;

/** 한 턴에서 내려받는 파일 인용(container_file_citation) 그림 수 상한. */
export const MAX_CITED_FIGURE_DOWNLOADS = 6;

/** 만료 복구 때 다시 실행하라고 넣는 이전 코드의 길이 상한(글자). */
export const REPLAY_CODE_MAX_CHARS = 40_000;

/** 일반 429(TPM, RPM)의 재시도 횟수와 한 번에 기다리는 최대 시간. */
export const RATE_LIMIT_MAX_RETRIES = 2;
export const RATE_LIMIT_MAX_WAIT_MS = 10_000;

/** 컨테이너, 파일 API 호출 하나의 타임아웃. */
export const OPENAI_SETUP_CALL_TIMEOUT_MS = 30_000;

/** 공개 데이터 파일 하나의 크기 상한. 이보다 크면 컨테이너에 올리지 않는다. */
export const MAX_DATA_FILE_BYTES = 50 * 1024 * 1024;

/** 브라우저 연결을 유지하는 하트비트 간격. */
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
