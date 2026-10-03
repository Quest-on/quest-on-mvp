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
 *   - 새로 만든 경우 이전 컨테이너에서 성공한 셀 코드를 다시 실행하게 한다(`buildReplayInstruction`).
 *
 * 저장(DB)은 하지 않는다. 결과는 호출부가 AI 메시지 metadata 에 넣는다.
 */

import type { AnalysisDataSource } from "@/lib/analysis-exec/eligibility";
import { OpenAIHttpError } from "@/lib/analysis-exec/errors";
import { REPLAY_CODE_MAX_CHARS } from "@/lib/analysis-exec/limits";
import type { StoredAnalysisFile, StoredAnalysisTurn } from "@/lib/analysis-exec/metadata";
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

/**
 * 만료 복구 때 다시 실행할 코드. 이전 컨테이너(`containerId`)에서 성공한(status completed) 셀을 시간 순서대로 모은다.
 * 이전에 복구하며 다시 실행한 코드도 그 컨테이너의 셀에 들어 있으므로 한 컨테이너의 셀만 모으면 된다.
 * 길이 상한을 넘으면 앞에서부터 들어가는 데까지 넣고 나머지 수를 센다.
 */
export function collectReplayCells(
  turns: ReadonlyArray<StoredAnalysisTurn>,
  containerId: string,
  maxChars: number = REPLAY_CODE_MAX_CHARS
): { codes: string[]; omitted: number } {
  const codes: string[] = [];
  let used = 0;
  let omitted = 0;
  for (const turn of turns) {
    if (turn.container_id !== containerId) continue;
    for (const cell of turn.cells) {
      if (cell.status !== "completed" || !cell.code.trim() || cell.code_truncated) continue;
      if (omitted > 0 || used + cell.code.length > maxChars) {
        omitted += 1;
        continue;
      }
      codes.push(cell.code);
      used += cell.code.length;
    }
  }
  return { codes, omitted };
}

/**
 * 복구 지시. 다음 턴 입력의 developer 메시지로 넣는다. 다시 실행할 코드가 없으면 null.
 * 학생 화면의 안내는 화면이 따로 보여 주므로 모델에게는 답변에서 되풀이하지 말라고 한다.
 */
export function buildReplayInstruction(replay: { codes: string[]; omitted: number }): string | null {
  if (replay.codes.length === 0) return null;
  const blocks = replay.codes.map((code, i) => `# 이전 셀 ${i + 1}\n${code.trimEnd()}`).join("\n\n");
  const lines = [
    "[이전 분석 코드(환경이 초기화되어 다시 실행 필요)]",
    "실행 환경이 초기화되어 이전 변수가 모두 사라졌습니다. 학생의 이번 요청을 처리하기 전에 아래 코드를 python 도구로 순서대로 다시 실행해 이전 상태를 복원하세요. 다시 실행한 코드의 출력은 답변에 옮기지 않고, 복원했다는 사실도 답변에서 되풀이하지 않습니다(화면이 따로 알립니다).",
  ];
  if (replay.omitted > 0) {
    lines.push(
      `길이 제한으로 마지막 셀 ${replay.omitted}개는 넣지 못했습니다. 그 단계가 필요하면 학생이 정한 기준을 대화에서 확인하고, 확인되지 않으면 학생에게 묻습니다.`
    );
  }
  lines.push("", "```python", blocks, "```");
  return lines.join("\n");
}
