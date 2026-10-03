/**
 * 복원 파일의 이름과 결과 줄 (이슈 #545, #564)
 *
 * 만료 복구는 서버가 이전 셀들을 복원 파일로 새 컨테이너에 올리고, 모델이 그 파일을 여는 한 줄을 실행하는 방식이다
 * (`container.ts` 의 `buildReplayScript`, `buildFileRestoreInstruction`). 그 셀이 마지막에 출력하는 결과 줄을 두 곳이 읽는다.
 *   - 서버: 복원이 끝났는지와 실패한 셀이 있는지를 기록한다(`turn-runner.ts` 의 복원 결과).
 *   - 화면용 기록: 복원 실행 줄만 있는 셀을 코드 대신 "이전 단계 다시 실행"과 다시 실행한 셀 수로 보이게 한다
 *     (`metadata.ts`, `AnalysisTurnBlock`).
 * 두 곳이 같은 형식을 읽도록 여기 한곳에 둔다. 복원 셀에서 복원 실행 줄을 가려내는 규칙(화면에서 접을지, 다음 복원에
 * 무엇을 넣을지)도 여기 둔다. 이 모듈은 순수하고 Node 전용 모듈을 쓰지 않는다.
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
 * 그대로여야 한다. 들여쓴 줄(try 블록 안 등)과 다른 문장이 같은 줄에 붙은 줄은 떼어 낼 수 없으므로 실행 줄로 보지 않는다.
 */
const REPLAY_RUN_LINE = new RegExp(
  String.raw`^exec\(\s*open\(\s*[rR]?(["'])[^"'\\\n]*` +
    REPLAY_FILE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    String.raw`\1\s*(?:,[^()\n]*)?\)\s*\.\s*read\(\s*\)\s*(?:,\s*globals\(\s*\)\s*(?:,\s*locals\(\s*\)\s*)?)?\)\s*;?\s*(?:#.*)?$`
);

/** 주석도 빈 줄도 아닌 줄. */
function isCodeLine(line: string): boolean {
  return line.trim() !== "" && !line.trimStart().startsWith("#");
}

/** 셀 코드를 복원 실행 줄 수와 나머지 줄로 나눈다. */
function splitReplayRunLines(code: string): { runLines: number; rest: string[] } {
  let runLines = 0;
  const rest: string[] = [];
  for (const line of code.split("\n")) {
    if (REPLAY_RUN_LINE.test(line.replace(/\r$/, ""))) runLines += 1;
    else rest.push(line);
  }
  return { runLines, rest };
}

/**
 * 복원 실행 줄만 있는 셀 코드인가(주석과 빈 줄은 보지 않는다). 화면은 이런 셀만 "이전 단계 다시 실행" 한 줄로 접는다
 * (#564). 모델이 같은 셀에 다른 분석 코드를 덧붙였으면 그 출력과 그림이 분석 기록(채점 근거)이므로 보통 셀로 보인다.
 */
export function isReplayOnlyCellCode(code: string): boolean {
  const { runLines, rest } = splitReplayRunLines(code);
  return runLines > 0 && !rest.some(isCodeLine);
}

/**
 * 복원 셀에서 다음 복원과 문항 간 연결에 넣을 코드. 복원 실행 줄을 뺀 나머지다(#564). 모델이 실행 줄 뒤에 덧붙인 분석
 * 코드가 만든 변수도 다음 복원에 있어야 한다. 실행 줄이 이전 셀을 다시 실행한 몫은 그 컨테이너의 복원 출처(원래 셀)가
 * 이미 맡는다.
 *   - 남는 코드가 없으면(실행 줄과 주석뿐) null.
 *   - 실행 줄을 가려내지 못했거나 남은 코드가 아직 복원 파일을 가리키면 null. 떼어 낼 수 없는 셀은 예전처럼 통째로 뺀다
 *     (복원 파일 안에서 복원 파일을 다시 실행하면 끝없이 되풀이된다).
 */
export function replayCellRemainder(code: string): string | null {
  const { runLines, rest } = splitReplayRunLines(code);
  const restCode = rest.filter(isCodeLine);
  if (runLines === 0 || restCode.length === 0) return null;
  if (restCode.some((line) => line.includes(REPLAY_FILE_NAME))) return null;
  return rest.join("\n").replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}
