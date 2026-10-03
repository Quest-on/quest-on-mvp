/**
 * 복원 파일의 이름과 결과 줄 (이슈 #545, #564)
 *
 * 만료 복구는 서버가 이전 셀들을 복원 파일로 새 컨테이너에 올리고, 모델이 그 파일을 여는 한 줄을 실행하는 방식이다
 * (`container.ts` 의 `buildReplayScript`, `buildFileRestoreInstruction`). 그 셀이 마지막에 출력하는 결과 줄을 두 곳이 읽는다.
 *   - 서버: 복원이 끝났는지와 실패한 셀이 있는지를 기록한다(`turn-runner.ts` 의 복원 결과).
 *   - 화면용 기록: 복원 실행 줄만 있는 셀을 코드 대신 "이전 단계 다시 실행"과 다시 실행한 셀 수로 보이게 한다
 *     (`metadata.ts`, `AnalysisTurnBlock`).
 * 두 곳이 같은 형식을 읽도록 여기 한곳에 둔다. 화면이 복원 셀을 접을지 가리는 복원 실행 줄 규칙도 여기 둔다.
 * 이 모듈은 순수하고 Node 전용 모듈을 쓰지 않는다.
 */

/** 복원 파일 이름. ASCII 이고 밑줄로 시작하지 않는다(컨테이너 경로가 앞 밑줄과 한글을 지운다, 스파이크 T8). */
export const REPLAY_FILE_NAME = "quest_on_replay.py";

/** 복원 파일이 마지막에 출력하는 결과 줄의 머리. 서버가 이 줄로 복원 성공 여부를 판단한다. */
export const REPLAY_MARKER = "QUEST_ON_REPLAY";

/** 복원 셀이 다시 실행한 원래 셀 수. */
export type ReplayResult = { ok: number; failed: number };

/** 복원 셀의 출력에서 결과 줄을 읽는다. 없으면 null(복원이 끝까지 돌지 않았다). */
export function parseReplayResult(logs: string): ReplayResult | null {
  const match = new RegExp(`^${REPLAY_MARKER} ok=(\\d+) failed=(\\d+)\\s*$`, "m").exec(logs);
  return match ? { ok: Number(match[1]), failed: Number(match[2]) } : null;
}

/** 이 셀이 복원 파일을 실행한 셀인가(코드에 복원 파일 이름이 있다). */
export function isReplayCellCode(code: string): boolean {
  return code.includes(REPLAY_FILE_NAME);
}

/**
 * 복원 실행 줄. 서버가 주는 한 줄(`replayExecLine`, `exec(open("<경로>").read())`)과 그 흔한 변형만 본다: 작은따옴표,
 * open 의 모드나 인코딩 인자, exec 의 globals()/locals(), 끝의 세미콜론과 주석. 경로는 복원 파일 이름으로 끝나는 문자열
 * 그대로여야 한다. 들여쓴 줄(try 블록 안 등)과 다른 문장이 같은 줄에 붙은 줄은 실행 줄로 보지 않는다.
 * 화면이 셀을 그릴 때마다 줄마다 돌므로 되돌아가기가 줄 길이에 비례하게 쓴다(공백 뒤의 `;` 는 `\s*(?:;\s*)?` 로 받는다.
 * `\s*;?\s*` 처럼 공백 반복이 맞붙으면 맞지 않는 긴 줄에서 길이의 제곱만큼 돈다).
 */
const REPLAY_RUN_LINE = new RegExp(
  String.raw`^exec\(\s*open\(\s*[rR]?(["'])[^"'\\\n]*` +
    REPLAY_FILE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    String.raw`\1\s*(?:,[^()\n]*)?\)\s*\.\s*read\(\s*\)\s*(?:,\s*globals\(\s*\)\s*(?:,\s*locals\(\s*\)\s*)?)?\)\s*(?:;\s*)?(?:#.*)?$`
);

/** 주석도 빈 줄도 아닌 줄. */
function isCodeLine(line: string): boolean {
  return line.trim() !== "" && !line.trimStart().startsWith("#");
}

/**
 * 복원 실행 줄만 있는 셀 코드인가(주석과 빈 줄은 보지 않는다). 화면은 이런 셀만 "이전 단계 다시 실행" 한 줄로 접는다
 * (#564). 모델이 같은 셀에 다른 분석 코드를 덧붙였으면 그 출력과 그림이 분석 기록(채점 근거)이므로 보통 셀로 보인다.
 * 화면 판단일 뿐이다. 다음 복원과 문항 간 연결은 덧붙인 코드가 있어도 복원 셀을 통째로 뺀다(`container.ts` 의
 * isReplayable). 복원 셀은 실행 줄이 예외로 멈춰도 완료로 기록되므로, 덧붙인 코드가 실제로 돌았는지 코드만으로는 알 수
 * 없다.
 */
export function isReplayOnlyCellCode(code: string): boolean {
  let runLines = 0;
  for (const raw of code.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (REPLAY_RUN_LINE.test(line)) runLines += 1;
    else if (isCodeLine(line)) return false;
  }
  return runLines > 0;
}
