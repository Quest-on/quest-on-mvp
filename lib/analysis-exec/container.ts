/**
 * 분석 컨테이너 준비와 만료 복구 (이슈 #545)
 *
 * 스파이크 7.2절을 따른다.
 *   - auto 컨테이너는 쓰지 않는다. 만료 뒤 조용히 새 컨테이너가 생겨 변수가 사라지기 때문이다. 명시 컨테이너
 *     (`POST /v1/containers`, memory 1g)를 세션의 첫 분석 턴에 만든다.
 *   - 공개 데이터 파일은 Files API 로 올리고 컨테이너를 만들 때 file_ids 로 연결한다(스파이크 T1 의 C 방식).
 *     컨테이너 안 경로는 `/mnt/data/<파일 id>-<이름>` 이다. 한글 이름은 경로에서 사라지므로 ASCII 이름으로 올리고
 *     원래 이름은 기록에 따로 둔다.
 *   - 턴마다 시작 전에 컨테이너를 조회한다. 조회가 마지막 사용 시각을 갱신한다. 상태가 expired 이거나 없으면
 *     같은 파일 id 로 새 컨테이너를 만든다. 파일 id 가 같으면 경로도 같아서 이전 코드가 그대로 돈다.
 *   - 새로 만든 경우 이전 상태를 되살린다. 원래 셀들을 복원 파일로 새 컨테이너에 올리고 모델은 그 파일을 여는 한 줄만
 *     실행한다(`buildReplayScript`, `buildFileRestoreInstruction`). 모델이 코드를 다시 쓰지 않으므로 출력 상한에 걸리지
 *     않는다. 파일을 못 올리면 모델이 코드를 다시 실행한다(`buildReplayInstruction`). 복원이 덜 끝나면 다음 턴에 다시 한다.
 *   - 복원한 이력의 출처(원래 셀)를 기록해, 다음 복원은 잘린 합본이 아니라 원래 셀로 만든다(`collectContainerHistory`).
 *   - 같은 문항에서 중단된 요청이 실행한 셀은 다음 턴에 알려 준다(`buildInterruptedCodeInstruction`).
 *   - 컨테이너는 세션 하나에 하나라 문항을 옮겨도 변수가 남는다. 대화(previous_response_id)는 문항마다 따로라
 *     새 문항의 대화는 다른 문항에서 무엇을 실행했는지 모른다. 그래서 다른 문항에서 같은 컨테이너로 실행한
 *     성공 셀 코드를 알려 준다(`buildLinkedCodeInstruction`). 복구가 필요한 턴은 복구 지시가 이를 대신한다.
 *
 * 저장(DB)은 하지 않는다. 결과는 호출부가 AI 메시지 metadata 에 넣는다.
 */

import type { AnalysisDataSource } from "@/lib/analysis-exec/eligibility";
import { OpenAIHttpError } from "@/lib/analysis-exec/errors";
import { REPLAY_CODE_MAX_CHARS } from "@/lib/analysis-exec/limits";
import {
  isSuccessfulOutcome,
  type AnalysisCellRef,
  type StoredAnalysisCell,
  type StoredAnalysisFile,
  type StoredAnalysisTurn,
} from "@/lib/analysis-exec/metadata";
import type { ContainerFileInfo, ContainerInfo } from "@/lib/analysis-exec/openai-http";

/**
 * 공개 데이터 파일 내려받기 결과. 실패는 두 가지다.
 *   - permanent: 다시 해도 같다(교수 자료 키 모양이 아님, 빈 파일, 용량 초과). 이 URL 은 "본 공개 자료"에 넣어
 *     다음 턴에 같은 자료로 본다(턴마다 컨테이너를 새로 만들지 않는다).
 *   - transient: 일시 오류(Storage 응답 실패). 본 공개 자료에 넣지 않는다. 그래서 다음 턴에 자료가 바뀐 것으로 보고
 *     다시 내려받아 본다(한 번의 일시 오류가 세션 내내 파일을 빠뜨리지 않는다).
 */
export type DataSourceDownload = { ok: true; bytes: Uint8Array } | { ok: false; permanent: boolean };

export type ContainerOps = {
  createContainer(params: { name: string; fileIds: string[] }): Promise<ContainerInfo>;
  retrieveContainer(params: { containerId: string }): Promise<ContainerInfo>;
  listContainerFiles(params: { containerId: string }): Promise<ContainerFileInfo[]>;
  uploadFile(params: { filename: string; bytes: Uint8Array; mime: string }): Promise<{ id: string }>;
  /** 컨테이너에 파일을 바로 올린다(복원 파일). 돌려받은 경로가 없으면 null. */
  uploadContainerFile(params: {
    containerId: string;
    filename: string;
    bytes: Uint8Array;
    mime: string;
  }): Promise<{ id: string; path: string | null }>;
  /** 공개 데이터 파일의 바이트. 실패하면 다시 해도 같은 실패인지 함께 알려 준다. */
  downloadDataSource(source: AnalysisDataSource): Promise<DataSourceDownload>;
};

export type EnsuredContainer = {
  containerId: string;
  files: StoredAnalysisFile[];
  /**
   * 이 컨테이너를 준비할 때 본 공개 데이터 파일 URL 전부(내려받지 못해 건너뛴 것 포함). 다음 턴에 공개 자료가
   * 바뀌었는지 이 목록으로 비교한다. 올린 파일(`files`)로 비교하면 늘 못 받는 파일 하나 때문에 턴마다 새로 만든다.
   */
  sources: string[];
  /** 이전 컨테이너가 있었는데 새로 만들었다(만료, 없음, 공개 자료 변경). */
  restarted: boolean;
  /** 새로 만들기 전의 컨테이너. 이 컨테이너에서 실행한 셀을 다시 실행한다. */
  previousContainerId: string | null;
  /**
   * 다시 올려서 파일 id(그래서 경로)가 바뀐 파일의 옛 경로와 새 경로. 이전 셀 코드를 다시 실행하기 전에 경로를
   * 바꿔 넣는다. 같은 파일 id 를 재사용했으면 비어 있다.
   */
  pathRewrites: Array<{ from: string; to: string }>;
};

/** 데이터 파일을 하나도 올리지 못해 컨테이너를 준비할 수 없다. */
export class AnalysisSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisSetupError";
  }
}

const MIME_BY_EXTENSION: Record<AnalysisDataSource["extension"], string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

/** 컨테이너가 쓸 수 없는 상태인가. */
function isDeadStatus(status: unknown): boolean {
  return status === "expired" || status === "deleted";
}

/**
 * 업로드할 ASCII 파일 이름. 컨테이너 경로는 한글과 공백, 앞의 밑줄을 지우므로(스파이크 T8) 우리가 먼저 안전한
 * 이름을 붙인다. 남는 글자가 없으면 `data<순번>` 이다.
 */
export function toAsciiUploadName(fileName: string, extension: AnalysisDataSource["extension"], index: number): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const ascii = base
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 60);
  return `${ascii || `data${index + 1}`}.${extension}`;
}

/** 이전 기록이 본 공개 데이터 URL. 예전 기록(sources 없음)은 올린 파일의 원본 URL 로 대신한다. */
function previousSources(previous: StoredAnalysisTurn): string[] {
  return previous.sources && previous.sources.length > 0 ? previous.sources : previous.files.map((f) => f.source);
}

function sameSources(previous: StoredAnalysisTurn, sources: ReadonlyArray<AnalysisDataSource>): boolean {
  const prev = new Set(previousSources(previous));
  const next = new Set(sources.map((s) => s.url));
  if (prev.size !== next.size) return false;
  for (const url of next) if (!prev.has(url)) return false;
  return true;
}

/** 같은 원본 URL 의 파일 경로가 바뀌었으면 옛 경로와 새 경로를 짝짓는다. */
function rewritesBetween(before: ReadonlyArray<StoredAnalysisFile>, after: ReadonlyArray<StoredAnalysisFile>) {
  const rewrites: Array<{ from: string; to: string }> = [];
  for (const old of before) {
    const now = after.find((f) => f.source === old.source);
    if (now && now.path !== old.path) rewrites.push({ from: old.path, to: now.path });
  }
  return rewrites;
}

async function uploadAll(ops: ContainerOps, sources: ReadonlyArray<AnalysisDataSource>) {
  const uploaded: Array<{ source: AnalysisDataSource; fileId: string; uploadName: string }> = [];
  // 다시 해도 못 받는 파일. 본 공개 자료에는 넣는다(아래 `seenSources`).
  const permanentlySkipped: string[] = [];
  for (const [index, source] of sources.entries()) {
    const download = await ops.downloadDataSource(source);
    if (!download.ok || download.bytes.byteLength === 0) {
      if (!download.ok && download.permanent) permanentlySkipped.push(source.url);
      continue;
    }
    const uploadName = toAsciiUploadName(source.fileName, source.extension, index);
    const { id } = await ops.uploadFile({
      filename: uploadName,
      bytes: download.bytes,
      mime: MIME_BY_EXTENSION[source.extension],
    });
    uploaded.push({ source, fileId: id, uploadName });
  }
  if (uploaded.length === 0) throw new AnalysisSetupError("no data file could be uploaded");
  // 올린 파일과 다시 해도 못 받는 파일. 일시 오류로 못 받은 파일은 빠져서 다음 턴에 다시 시도된다.
  const seenSources = [...uploaded.map((u) => u.source.url), ...permanentlySkipped];
  return { uploaded, seenSources };
}

/** 컨테이너 파일 목록에서 각 파일 id 의 경로를 찾는다. 못 찾으면 컨테이너의 경로 규칙으로 짐작한다. */
async function resolveFiles(
  ops: ContainerOps,
  containerId: string,
  uploaded: ReadonlyArray<{ source: AnalysisDataSource; fileId: string; uploadName: string }>
): Promise<StoredAnalysisFile[]> {
  let listed: ContainerFileInfo[] = [];
  try {
    listed = await ops.listContainerFiles({ containerId });
  } catch {
    // 목록을 못 읽어도 경로 규칙으로 간다.
  }
  return uploaded.map(({ source, fileId, uploadName }) => {
    const hit = listed.find((f) => typeof f.path === "string" && f.path.includes(fileId));
    return {
      name: source.fileName,
      path: hit?.path ?? `/mnt/data/${fileId}-${uploadName}`,
      file_id: fileId,
      source: source.url,
    };
  });
}

function containerName(sessionId: string): string {
  return `quest-on-analysis-${sessionId}`.slice(0, 64);
}

async function createFresh(
  ops: ContainerOps,
  sessionId: string,
  sources: ReadonlyArray<AnalysisDataSource>
): Promise<{ containerId: string; files: StoredAnalysisFile[]; sources: string[] }> {
  const { uploaded, seenSources } = await uploadAll(ops, sources);
  const container = await ops.createContainer({ name: containerName(sessionId), fileIds: uploaded.map((u) => u.fileId) });
  return { containerId: container.id, files: await resolveFiles(ops, container.id, uploaded), sources: seenSources };
}

/**
 * 이번 턴에 쓸 컨테이너를 준비한다.
 *
 * - 이전 기록이 없으면 파일을 올리고 새로 만든다(restarted false).
 * - 이전 컨테이너가 살아 있고 공개 자료가 같으면 그대로 쓴다. 조회가 갱신을 겸한다.
 * - 이전 컨테이너가 만료됐거나 없거나 `forceNew` 면 새로 만든다(restarted true). 공개 자료가 같으면 같은 파일 id 를
 *   재사용하고, 그 파일이 없어졌으면 다시 올린다.
 * - 조회가 잔액 소진으로 실패하면 그대로 던진다. 그 밖의 조회 실패(네트워크 등)는 이전 컨테이너를 그대로 쓴다 —
 *   만료였다면 응답 호출이 `Container is expired` 로 알려 주고, 호출부가 `forceNew` 로 다시 부른다.
 */
export async function ensureAnalysisContainer(
  ops: ContainerOps,
  params: {
    sessionId: string;
    previous: StoredAnalysisTurn | null;
    dataSources: ReadonlyArray<AnalysisDataSource>;
    forceNew?: boolean;
  }
): Promise<EnsuredContainer> {
  const { sessionId, previous, dataSources } = params;

  if (!previous) {
    const fresh = await createFresh(ops, sessionId, dataSources);
    return { ...fresh, restarted: false, previousContainerId: null, pathRewrites: [] };
  }

  // 공개 자료가 같으면(재사용 경로) 이전 기록의 "본 공개 자료"를 그대로 이어 간다.
  const keptSources = previousSources(previous);
  const reuse = (): EnsuredContainer => ({
    containerId: previous.container_id,
    files: previous.files,
    sources: keptSources,
    restarted: false,
    previousContainerId: null,
    pathRewrites: [],
  });

  const same = sameSources(previous, dataSources);

  if (same && !params.forceNew) {
    try {
      const info = await ops.retrieveContainer({ containerId: previous.container_id });
      if (!isDeadStatus(info.status)) return reuse();
    } catch (error) {
      const dead =
        error instanceof OpenAIHttpError && (error.kind === "container_expired" || error.status === 404);
      if (error instanceof OpenAIHttpError && error.kind === "quota_exhausted") throw error;
      if (!dead) return reuse();
    }
  }

  // 새 컨테이너. 공개 자료가 같으면 파일 id 를 재사용해 경로를 그대로 둔다.
  if (same) {
    try {
      const container = await ops.createContainer({
        name: containerName(sessionId),
        fileIds: previous.files.map((f) => f.file_id),
      });
      return {
        containerId: container.id,
        files: previous.files,
        sources: keptSources,
        restarted: true,
        previousContainerId: previous.container_id,
        pathRewrites: [],
      };
    } catch (error) {
      if (error instanceof OpenAIHttpError && error.kind === "quota_exhausted") throw error;
      // 파일이 지워졌거나 재사용할 수 없으면 다시 올린다.
    }
  }

  const fresh = await createFresh(ops, sessionId, dataSources);
  return {
    ...fresh,
    restarted: true,
    previousContainerId: previous.container_id,
    pathRewrites: rewritesBetween(previous.files, fresh.files),
  };
}

/** 이전 셀 코드 안의 옛 데이터 파일 경로를 새 경로로 바꾼다. */
export function applyPathRewrites(code: string, rewrites: ReadonlyArray<{ from: string; to: string }>): string {
  let out = code;
  for (const { from, to } of rewrites) {
    if (from) out = out.split(from).join(to);
  }
  return out;
}

/** 세션의 분석 턴 기록 하나와 그 턴의 문항(0부터). `SessionAnalysisRecord` 에서 필요한 부분이다. */
export type AnalysisTurnRecord = { messageId?: string; qIdx: number; turn: StoredAnalysisTurn };

/** 이력(원래 셀의 출처)을 다루는 함수가 받는 기록. 메시지 id 가 있어야 셀을 가리킬 수 있다. */
export type HistoryRecord = AnalysisTurnRecord & { messageId: string };

/** 모델에게 다시 실행하게 하거나 알려 주는 셀 코드 하나. `qIdx` 는 그 셀을 실행한 문항(0부터)이다. */
export type CarriedCell = { qIdx: number; code: string };

export type CarriedCells = { cells: CarriedCell[]; omitted: number };

/** 원래 셀 하나와 그 출처. 복원 파일과 다음 복원의 이력에 쓴다. */
export type HistoryCell = CarriedCell & { ref: AnalysisCellRef };

/** 다시 실행할 수 있는 원래 셀인가. 실패한 셀, 빈 코드, 저장 상한에 잘린 코드, 복원 셀은 아니다. */
function isReplayable(cell: StoredAnalysisCell): boolean {
  return cell.status === "completed" && cell.code.trim() !== "" && !cell.code_truncated && cell.replay !== true;
}

/**
 * 앞에서부터 상한 안에 들어가는 데까지 넣고, 넘치면 그 뒤 셀은 짧아도 모두 빼고 수를 센다(실행 순서가 끊긴 코드를
 * 주지 않는다).
 */
export function capCells<T extends { code: string }>(cells: ReadonlyArray<T>, maxChars: number): { cells: T[]; omitted: number } {
  const kept: T[] = [];
  let used = 0;
  let omitted = 0;
  for (const cell of cells) {
    if (omitted > 0 || used + cell.code.length > maxChars) {
      omitted += 1;
      continue;
    }
    kept.push(cell);
    used += cell.code.length;
  }
  return { cells: kept, omitted };
}

/** 이 문항의 마지막 성공 턴의 위치. 이 문항의 대화는 거기까지 이어진다(실패한 턴은 이어 쓰지 않는다). 없으면 -1. */
function lastSuccessfulTurnIndex(records: ReadonlyArray<AnalysisTurnRecord>, qIdx: number): number {
  let lastSeen = -1;
  records.forEach((record, i) => {
    if (record.qIdx === qIdx && isSuccessfulOutcome(record.turn.outcome)) lastSeen = i;
  });
  return lastSeen;
}

/**
 * 이 문항의 대화가 아직 모르는, 지금 컨테이너(`containerId`)에서 실행된 셀. 이 문항의 마지막 성공 턴 뒤의 기록만 본다.
 *   - linked: 다른 문항이 실행한 셀(문항 간 연결). 새 문항의 첫 턴이면 다른 문항의 셀 전부다.
 *   - interrupted: 같은 문항에서 중단된 요청(시간이나 셀 상한, 연결 끊김, 오류)이 끝나기 전에 실행한 셀. 그 요청은
 *     대화에 이어지지 않으므로 다음 턴의 모델은 이 셀이 실행된 것을 모른다.
 * 둘은 시간 순서로 한 상한(`maxChars`)을 나눠 쓴다. 같은 문항에서 이어지는 성공 턴은 둘 다 비어 있다.
 */
export function collectUnseenCells(
  records: ReadonlyArray<AnalysisTurnRecord>,
  params: { containerId: string; qIdx: number; maxChars?: number }
): { linked: CarriedCells; interrupted: CarriedCells } {
  const lastSeen = lastSuccessfulTurnIndex(records, params.qIdx);
  const unseen: Array<CarriedCell & { own: boolean }> = [];
  for (const record of records.slice(lastSeen + 1)) {
    if (record.turn.container_id !== params.containerId) continue;
    for (const cell of record.turn.cells) {
      if (!isReplayable(cell)) continue;
      unseen.push({ qIdx: record.qIdx, code: cell.code, own: record.qIdx === params.qIdx });
    }
  }
  const capped = capCells(unseen, params.maxChars ?? REPLAY_CODE_MAX_CHARS);
  const omitted = unseen.slice(capped.cells.length);
  const pick = (own: boolean): CarriedCells => ({
    cells: capped.cells.filter((c) => c.own === own).map(({ qIdx, code }) => ({ qIdx, code })),
    omitted: omitted.filter((c) => c.own === own).length,
  });
  return { linked: pick(false), interrupted: pick(true) };
}

/** 문항 간 연결로 알려 줄 코드(`collectUnseenCells` 의 linked). */
export function collectLinkedCells(
  records: ReadonlyArray<AnalysisTurnRecord>,
  params: { containerId: string; qIdx: number; maxChars?: number }
): CarriedCells {
  return collectUnseenCells(records, params).linked;
}

/**
 * 컨테이너의 상태를 처음부터 다시 만들 원래 셀들(시간 순서). 만료 뒤 새 컨테이너에 복원할 때 쓴다.
 *   - 이 컨테이너가 복원으로 시작했으면 그 복원의 출처(`restore.refs`, 원래 셀)를 먼저 둔다. 복원 셀(파일을 여는 한 줄)이나
 *     모델이 다시 쓴 코드가 아니라 원래 셀이므로, 복원 셀이 저장 상한에 잘려도 다음 복원에서 이력이 빠지지 않는다.
 *   - 그 뒤에 이 컨테이너에서 실행한 다시 실행할 수 있는 셀을 시간 순서로 둔다. 파일을 못 올려 모델이 코드를 다시 쓴
 *     복원 턴(inline)은 어느 셀이 다시 쓴 코드인지 알 수 없으므로 통째로 뺀다(같은 처리가 두 번 적용되지 않게).
 */
export function collectContainerHistory(records: ReadonlyArray<HistoryRecord>, containerId: string): HistoryCell[] {
  const byMessage = new Map(records.map((r) => [r.messageId, r] as const));
  const inContainer = records.filter((r) => r.turn.container_id === containerId);
  const history: HistoryCell[] = [];

  const restoreRecord = inContainer.find((r) => r.turn.restore);
  for (const ref of restoreRecord?.turn.restore?.refs ?? []) {
    const source = byMessage.get(ref.m);
    const cell = source?.turn.cells.find((c) => c.index === ref.i);
    if (!source || !cell || !isReplayable(cell)) continue;
    history.push({ qIdx: source.qIdx, code: cell.code, ref: { m: ref.m, i: ref.i } });
  }

  for (const record of inContainer) {
    if (record.turn.restore?.mode === "inline") continue;
    for (const cell of record.turn.cells) {
      if (!isReplayable(cell)) continue;
      history.push({ qIdx: record.qIdx, code: cell.code, ref: { m: record.messageId, i: cell.index } });
    }
  }
  return history;
}

/**
 * 이 컨테이너를 시작한 복원이 덜 끝났는가(복원 셀이 끝까지 돌지 못함). 그러면 다음 턴은 새 컨테이너를 만들어 다시
 * 복원한다. 복원은 끝났지만 실패한 셀이 있는 경우(partial)는 다시 해도 같으므로 다시 하지 않는다.
 */
export function restoreNeedsRetry(records: ReadonlyArray<AnalysisTurnRecord>, containerId: string): boolean {
  const restoreRecord = records.find((r) => r.turn.container_id === containerId && r.turn.restore);
  return restoreRecord?.turn.restore?.status === "incomplete";
}

/**
 * 기록에 남은 모든 옛 데이터 파일 경로를 지금 경로로 바꾸는 짝. 같은 원본 URL 의 파일이 지금 다른 경로에 있으면
 * 짝짓는다. 이력의 셀은 여러 세대 전 컨테이너의 경로를 쓸 수 있으므로 바로 앞 컨테이너만 보지 않는다.
 */
export function historyPathRewrites(
  records: ReadonlyArray<AnalysisTurnRecord>,
  currentFiles: ReadonlyArray<StoredAnalysisFile>
): Array<{ from: string; to: string }> {
  const current = new Map(currentFiles.map((f) => [f.source, f.path] as const));
  const seen = new Set<string>();
  const rewrites: Array<{ from: string; to: string }> = [];
  for (const record of records) {
    for (const file of record.turn.files) {
      const to = current.get(file.source);
      if (!to || !file.path || file.path === to || seen.has(file.path)) continue;
      seen.add(file.path);
      rewrites.push({ from: file.path, to });
    }
  }
  return rewrites;
}

/** 코드 블록 본문. 셀마다 `# 문제 2 셀 1` 처럼 실행한 문항(화면 번호)과 그 문항 안의 순번을 붙인다. */
function formatCarriedCells(cells: ReadonlyArray<CarriedCell>): string {
  const perQuestion = new Map<number, number>();
  return cells
    .map(({ qIdx, code }) => {
      const nth = (perQuestion.get(qIdx) ?? 0) + 1;
      perQuestion.set(qIdx, nth);
      return `# 문제 ${qIdx + 1} 셀 ${nth}\n${code.trimEnd()}`;
    })
    .join("\n\n");
}

/** 지금 문항을 알리는 줄. 셀 머리의 문제 번호와 견주라고 둔다(지시문 머리에는 문제 번호가 없다). */
function currentQuestionLine(currentQIdx: number): string {
  return `지금 풀고 있는 문제는 문제 ${currentQIdx + 1}입니다.`;
}

function mixedQuestionLine(cells: ReadonlyArray<CarriedCell>, currentQIdx: number): string | null {
  return cells.some((cell) => cell.qIdx !== currentQIdx)
    ? `${currentQuestionLine(currentQIdx)} 다른 번호가 붙은 셀은 앞 문항에서 실행한 코드입니다.`
    : null;
}

export const REPLAY_INSTRUCTION_HEADER = "[이전 분석 코드(환경이 초기화되어 다시 실행 필요)]";
export const LINKED_CODE_HEADER = "[앞 문항에서 실행한 분석 코드 — 변수는 분석 환경에 그대로 남아 있음]";
export const INTERRUPTED_CODE_HEADER = "[직전 요청이 중단되기 전에 이미 실행된 코드 — 변수에 반영돼 있음]";

const REPLAY_QUIET_LINE =
  "다시 실행한 코드의 출력은 답변에 옮기지 않고, 복원했다는 사실도 답변에서 되풀이하지 않습니다(화면이 따로 알립니다).";

/**
 * 복구 지시(모델이 코드를 다시 실행). 복원 파일을 올리지 못했을 때 쓴다. 다음 턴 입력의 developer 메시지로 넣는다.
 * 다시 실행할 코드가 없으면 null. 다른 문항의 셀이 섞여 있으면 지금 문항을 함께 알린다(이 턴에는 문항 간 연결 지시를
 * 이 지시가 대신한다).
 */
export function buildReplayInstruction(replay: CarriedCells & { currentQIdx: number }): string | null {
  if (replay.cells.length === 0) return null;
  const lines = [
    REPLAY_INSTRUCTION_HEADER,
    "실행 환경이 초기화되어 이전 변수가 모두 사라졌습니다. 학생의 이번 요청을 처리하기 전에 아래 코드를 python 도구로 순서대로 다시 실행해 이전 상태를 복원하세요. 다시 실행한 코드의 출력은 답변에 옮기지 않고, 복원했다는 사실도 답변에서 되풀이하지 않습니다(화면이 따로 알립니다).",
  ];
  const mixed = mixedQuestionLine(replay.cells, replay.currentQIdx);
  if (mixed) lines.push(mixed);
  if (replay.omitted > 0) {
    lines.push(
      `길이 제한으로 마지막 셀 ${replay.omitted}개는 넣지 못했습니다. 그 단계가 필요하면 학생이 정한 기준을 대화에서 확인하고, 확인되지 않으면 학생에게 묻습니다.`
    );
  }
  lines.push("", "```python", formatCarriedCells(replay.cells), "```");
  return lines.join("\n");
}

/** 복원 파일을 여는 한 줄. 경로는 JSON 문자열(파이썬 문자열로도 맞다)로 감싼다. */
export function replayExecLine(path: string): string {
  return `exec(open(${JSON.stringify(path)}).read())`;
}

/**
 * 복구 지시(파일 방식). 서버가 이전 셀을 복원 파일로 컨테이너에 올려 두었으므로 모델은 그 파일을 여는 한 줄만 실행한다.
 * 코드를 다시 쓰지 않으므로 출력 토큰이 거의 들지 않는다. 참고 코드는 입력으로만 준다(파일을 못 열면 그 코드로 복원).
 */
export function buildFileRestoreInstruction(params: {
  path: string;
  reference: CarriedCells;
  /** 파일에도 넣지 못한 셀 수(파일 상한). */
  omittedFromFile: number;
  currentQIdx: number;
}): string {
  const lines = [
    REPLAY_INSTRUCTION_HEADER,
    "실행 환경이 초기화되어 이전 변수가 모두 사라졌습니다. 학생의 이번 요청을 처리하기 전에 python 도구로 아래 한 줄만 실행해 이전 상태를 복원하세요. 코드를 다시 쓰지 않고 이 한 줄만 실행합니다.",
    "```python",
    replayExecLine(params.path),
    "```",
    `실행 결과의 ${REPLAY_MARKER} 줄에 실패한 셀이 있으면 그 셀이 만들던 값은 없을 수 있습니다. 그 값이 필요해지면 학생에게 알리고 다시 계산할지 묻습니다. 이 한 줄이 파일을 찾지 못해 실패하면 아래 참고 코드를 순서대로 다시 실행해 복원합니다.`,
    REPLAY_QUIET_LINE,
  ];
  const mixed = mixedQuestionLine(params.reference.cells, params.currentQIdx);
  if (mixed) lines.push(mixed);
  if (params.omittedFromFile > 0) {
    lines.push(
      `길이 제한으로 마지막 셀 ${params.omittedFromFile}개는 파일에도 넣지 못했습니다. 그 단계가 필요하면 학생이 정한 기준을 대화에서 확인하고, 확인되지 않으면 학생에게 묻습니다.`
    );
  }
  if (params.reference.omitted > 0) {
    lines.push(`참고 코드에는 길이 제한으로 마지막 셀 ${params.reference.omitted}개를 넣지 않았습니다(파일에는 들어 있습니다).`);
  }
  if (params.reference.cells.length > 0) {
    lines.push("", "참고 코드(위 파일이 실행하는 코드입니다. 다시 실행하지 않습니다):", "```python", formatCarriedCells(params.reference.cells), "```");
  }
  return lines.join("\n");
}

/**
 * 문항 간 연결 지시. 새 문항의 첫 분석 턴(그리고 이 문항의 마지막 성공 턴 뒤에 다른 문항에서 실행한 코드가 있는 턴)
 * 입력의 developer 메시지로 넣는다. 알려 줄 코드가 없으면 null. 변수는 남아 있으므로 다시 실행하라고 하지 않는다.
 * 앞 문항의 처리를 이어 쓸지 학생에게 확인하는 규칙은 지시문(`analysis-partner@2` 도구 있음 3절)에 있다.
 */
export function buildLinkedCodeInstruction(linked: CarriedCells & { currentQIdx: number }): string | null {
  if (linked.cells.length === 0) return null;
  const lines = [
    LINKED_CODE_HEADER,
    `${currentQuestionLine(linked.currentQIdx)} 아래는 같은 실행 환경에서 다른 문제를 풀며 실행한 코드입니다. 이 코드가 만든 변수는 지금도 실행 환경에 남아 있으므로 다시 실행하지 않아도 됩니다.`,
  ];
  if (linked.omitted > 0) {
    lines.push(
      `길이 제한으로 마지막 셀 ${linked.omitted}개의 코드는 넣지 못했습니다. 그 셀이 만든 변수도 남아 있으니 필요하면 실행 환경에서 확인합니다.`
    );
  }
  lines.push("", "```python", formatCarriedCells(linked.cells), "```");
  return lines.join("\n");
}

/**
 * 중단된 요청의 코드 지시. 같은 문항에서 앞선 요청이 끝나기 전에(시간이나 셀 상한, 연결 끊김, 오류) 실행된 셀이다.
 * 그 요청은 대화에 이어지지 않으므로 모델은 이 셀이 실행된 것을 모른다. 같은 처리가 두 번 적용되지 않게 지금 상태를
 * 먼저 확인하라고 한다. 알려 줄 코드가 없으면 null.
 */
export function buildInterruptedCodeInstruction(interrupted: CarriedCells & { currentQIdx: number }): string | null {
  if (interrupted.cells.length === 0) return null;
  const lines = [
    INTERRUPTED_CODE_HEADER,
    `${currentQuestionLine(interrupted.currentQIdx)} 이 문제에서 앞선 요청이 중단되기 전에 아래 코드가 이미 실행되어 그 결과가 변수에 반영돼 있습니다. 대화에는 그 요청이 남아 있지 않습니다. 같은 처리를 다시 하기 전에 지금 상태(행 수 등)를 먼저 확인합니다.`,
  ];
  if (interrupted.omitted > 0) {
    lines.push(
      `길이 제한으로 마지막 셀 ${interrupted.omitted}개의 코드는 넣지 못했습니다. 그 셀이 만든 변수도 남아 있으니 필요하면 실행 환경에서 확인합니다.`
    );
  }
  lines.push("", "```python", formatCarriedCells(interrupted.cells), "```");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 복원 파일
// ---------------------------------------------------------------------------

/** 복원 파일 이름. ASCII 이고 밑줄로 시작하지 않는다(컨테이너 경로가 앞 밑줄과 한글을 지운다, 스파이크 T8). */
export const REPLAY_FILE_NAME = "quest_on_replay.py";

/** 복원 파일이 마지막에 출력하는 결과 줄의 머리. 서버가 이 줄로 복원 성공 여부를 판단한다. */
export const REPLAY_MARKER = "QUEST_ON_REPLAY";

function toBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * 복원 파일(파이썬). 원래 셀들을 순서대로 다시 실행해 변수를 되살린다. ASCII 만 쓴다(파일을 여는 쪽의 기본 인코딩과
 * 관계없게). 셀 코드는 base64 로 넣어 따옴표나 줄바꿈 때문에 깨지지 않게 한다.
 *   - 셀마다 따로 실행한다. 한 셀이 실패해도 다음 셀로 간다(원래도 셀마다 따로 실행됐다). 실패한 셀은 이름과 오류를 모은다.
 *   - 다시 실행하는 동안의 출력은 버리고, 그래프는 화면에 내보내지 않고 닫는다(plt.show 를 잠시 바꾼다). 복원 셀의
 *     기록과 그림이 이전 출력으로 넘치지 않게 한다. 끝나면 plt.show 를 되돌린다.
 *   - 마지막에 `QUEST_ON_REPLAY ok=<성공 수> failed=<실패 수>` 와 실패한 셀마다 한 줄을 출력한다.
 */
export function buildReplayScript(cells: ReadonlyArray<CarriedCell>): string {
  const perQuestion = new Map<number, number>();
  const entries = cells.map(({ qIdx, code }) => {
    const nth = (perQuestion.get(qIdx) ?? 0) + 1;
    perQuestion.set(qIdx, nth);
    return `    ("Q${qIdx + 1}-C${nth}", "${toBase64(code)}"),`;
  });
  return [
    "# Quest-On analysis replay. Generated by the server to restore variables from earlier cells.",
    "import base64 as _qo_b64, contextlib as _qo_ctx, io as _qo_io",
    "_qo_cells = [",
    ...entries,
    "]",
    "_qo_failed = []",
    "try:",
    "    import matplotlib.pyplot as _qo_plt",
    "    _qo_show = _qo_plt.show",
    '    _qo_plt.show = lambda *a, **k: _qo_plt.close("all")',
    "except Exception:",
    "    _qo_plt = None",
    "try:",
    "    for _qo_label, _qo_src in _qo_cells:",
    "        try:",
    "            with _qo_ctx.redirect_stdout(_qo_io.StringIO()), _qo_ctx.redirect_stderr(_qo_io.StringIO()):",
    '                exec(compile(_qo_b64.b64decode(_qo_src).decode("utf-8"), _qo_label, "exec"), globals())',
    "        except Exception as _qo_e:",
    '            _qo_failed.append("%s %s: %s" % (_qo_label, type(_qo_e).__name__, str(_qo_e)[:200]))',
    "finally:",
    "    if _qo_plt is not None:",
    "        _qo_plt.show = _qo_show",
    '        _qo_plt.close("all")',
    `print("${REPLAY_MARKER} ok=%d failed=%d" % (len(_qo_cells) - len(_qo_failed), len(_qo_failed)))`,
    "for _qo_line in _qo_failed:",
    `    print("${REPLAY_MARKER}_ERROR " + _qo_line)`,
    "del _qo_cells, _qo_failed",
    "",
  ].join("\n");
}

/** 복원 셀의 출력에서 결과 줄을 읽는다. 없으면 null(복원이 끝까지 돌지 않았다). */
export function parseReplayResult(logs: string): { ok: number; failed: number } | null {
  const match = new RegExp(`^${REPLAY_MARKER} ok=(\\d+) failed=(\\d+)\\s*$`, "m").exec(logs);
  return match ? { ok: Number(match[1]), failed: Number(match[2]) } : null;
}

/** 이 셀이 복원 파일을 실행한 셀인가(코드에 복원 파일 이름이 있다). */
export function isReplayCellCode(code: string): boolean {
  return code.includes(REPLAY_FILE_NAME);
}
