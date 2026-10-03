/**
 * 복원 파일의 이름과 결과 줄 (이슈 #545, #564)
 *
 * 만료 복구는 서버가 이전 셀들을 복원 파일로 새 컨테이너에 올리고, 모델이 그 파일을 여는 한 줄을 실행하는 방식이다
 * (`container.ts` 의 `buildReplayScript`, `buildFileRestoreInstruction`). 그 셀이 마지막에 출력하는 결과 줄을 두 곳이 읽는다.
 *   - 서버: 복원이 끝났는지와 실패한 셀이 있는지를 기록한다(`turn-runner.ts` 의 복원 결과).
 *   - 화면용 기록: 복원 셀을 코드 대신 "이전 단계 다시 실행"과 다시 실행한 셀 수로 보이게 한다(`metadata.ts`).
 * 두 곳이 같은 형식을 읽도록 여기 한곳에 둔다. 이 모듈은 순수하고 Node 전용 모듈을 쓰지 않는다.
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
