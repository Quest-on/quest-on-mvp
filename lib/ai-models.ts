/**
 * AI 모델 상수 — SDK 의존성 없는 순수 모듈.
 *
 * `lib/openai.ts` 는 모듈 로드 시점에 OpenAI 클라이언트를 만든다. 모델 이름 세 개를
 * 읽으려고 그 무거운 그래프를 끌고 오면 순수 해석 계층(`lib/ai-task-profile.ts`)과
 * 그걸 쓰는 테스트가 전부 SDK 초기화 비용을 문다. 그래서 상수만 여기로 분리했다.
 *
 * `lib/openai.ts` 가 이 값들을 그대로 재수출하므로 기존 import 경로는 바뀌지 않는다.
 *
 * 2026-08 GPT-5.6 계열로 교체. 근거:
 *   - `gpt-5.3-chat-latest` 는 OpenAI 공식 문서에서 deprecated 로 표시됐다.
 *     ("This model has been deprecated. We recommend GPT-5.6 for most API usage.")
 *     컨텍스트 128K·지식컷 2025-08 로 세대가 뒤처져 있었고, 학생 채팅 트래픽 대부분이 여기 물려 있었다.
 *   - `gpt-4o-mini` 는 4o 세대 잔재라 채점 워커만 다른 세대를 쓰고 있었다.
 *
 * 실측(교수 실채점 24건 골든셋, 답안 20~85점 분포)에서 Luna 가 현행 대비 전 지표 우위:
 *   MAE 19.3→17.9 · 교수점수 상관 0.310→0.405 · 지연 2.3s→1.4s · 비용 13배 절감.
 *   Sol 은 MAE 17.8 로 근소 우위지만 37배 비싸고 3배 느려 채택하지 않았다.
 *
 * HEAVY 만 Terra 로 한 단계 올려 둔다. 문항 생성·자동 채점은 호출량이 적어 비용 영향이 작고,
 * 툴 호출·다단계 추론이 섞이는 경로라 아직 측정되지 않은 위험이 남아 있다.
 */

export const AI_MODEL = process.env.AI_MODEL || "gpt-5.6-luna";
export const AI_MODEL_HEAVY = process.env.AI_MODEL_HEAVY || "gpt-5.6-terra";
export const AI_MODEL_BULK_GRADING_WORKER =
  process.env.AI_MODEL_BULK_GRADING_WORKER || "gpt-5.6-luna";
