/**
 * 교수자가 학생에게 뿌릴 공지문 조립 (이슈 #85 / AC-16).
 *
 * 왜 제품이 문구를 대신 써주는가: 대학생 54%가 시험에서 AI 사용을 부정행위로
 * 인식한다. 우리 제품은 AI에게 묻는 것이 시험의 일부이고 clarification 단계
 * 자체가 채점 대상(`grades.stage_grading.chat`)인데 학생은 이걸 모른다.
 * 겁먹은 학생이 질문을 안 하면 점수가 낮게 나오고, 그건 제품이 만든 불평등이다.
 *
 * 교수자에게 "알아서 공지하세요"라고 하면 대부분 안 한다. 문구를 쥐어주는 편이
 * 공지 채널을 새로 만드는 것보다 싸고 확실하다(공유 링크 라우트는 만들지 않는다).
 *
 * 이 함수는 **이미 번역된 문자열만** 받는다. 번역은 호출부의 next-intl 이 한다.
 */

export type StudentNoticeInput = {
  /** 제목 줄. 예: "[퀘스트온] 시험 안내" */
  heading: string;
  examTitle: string;
  /** 입장 코드 라벨. 예: "입장 코드" */
  codeLabel: string;
  examCode: string;
  /** AI 사용 안내 문장들. 순서대로 불릿이 된다. */
  policyLines: string[];
  /** 마무리 줄(선택). 예: "문의는 담당 교수자에게." */
  footer?: string;
};

/**
 * 붙여넣기 가능한 평문 공지문을 만든다.
 *
 * 평문인 이유: 교수자가 실제로 쓰는 채널(LMS 공지, 카카오톡, 이메일)이 전부
 * 다른 서식을 쓴다. 마크다운을 넣으면 어딘가에서는 `**` 가 그대로 보인다.
 */
export function buildStudentNotice(input: StudentNoticeInput): string {
  const lines: string[] = [];

  lines.push(input.heading);
  lines.push("");

  if (input.examTitle.trim()) lines.push(input.examTitle.trim());
  lines.push(`${input.codeLabel}: ${input.examCode}`);

  const policies = input.policyLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (policies.length > 0) {
    lines.push("");
    for (const line of policies) lines.push(`- ${line}`);
  }

  const footer = input.footer?.trim();
  if (footer) {
    lines.push("");
    lines.push(footer);
  }

  return lines.join("\n");
}
