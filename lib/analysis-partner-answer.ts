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

/** 잘린 자리가 코드 블록(```)이나 수식 블록($$) 안이면 닫는다. 코드 블록 안의 $$ 는 세지 않는다. */
function closeOpenBlocks(text: string): string {
  let inFence = false;
  let inMath = false;
  for (const line of text.split("\n")) {
    if (/^[ \t]*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inMath = !inMath;
  }
  if (inFence) return `${text}\n\`\`\``;
  if (inMath) return `${text}\n$$`;
  return text;
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
