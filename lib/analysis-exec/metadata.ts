/**
 * 분석 턴 기록의 모양 (이슈 #545)
 *
 * DDL 없이 AI 메시지의 `messages.metadata.analysis`(jsonb)에 둔다. 새 테이블을 만들지 않는다.
 *   - 서버만 보는 값: `container_id`, `files[].file_id`. 학생과 교수에게 내려보내지 않는다(같은 조직 키를 가진 쪽이
 *     컨테이너를 쓸 수 있으므로, 스파이크 T8).
 *   - 그림은 비공개 버킷 `analysis-outputs` 의 경로만 둔다. 화면은 권한 확인 라우트로 연다.
 *   - 다음 턴은 이 세션의 가장 최근 analysis 기록에서 컨테이너와 파일을 읽는다.
 *
 * jsonb 는 무엇이든 들어 있을 수 있으므로 읽을 때는 `readStoredAnalysisTurn` 으로 모양을 확인한다.
 * 이 모듈은 순수하다.
 */

export const ANALYSIS_METADATA_VERSION = 1;

/** 그림을 두는 비공개 Storage 버킷. 오케스트레이터가 스테이징과 운영에 만든다(private, png/jpeg, 10MB). */
export const ANALYSIS_OUTPUTS_BUCKET = "analysis-outputs";

export type AnalysisFigureMime = "image/png" | "image/jpeg";

export type StoredAnalysisFigure = {
  /** 버킷 안 경로: `세션/메시지/파일이름`. */
  path: string;
  mime: AnalysisFigureMime;
  bytes: number;
  /** 같은 그림이 셀 출력과 파일 인용으로 두 번 올 때 한 장만 남기려고 쓴다. */
  sha256: string;
};

export type StoredAnalysisCell = {
  /** 턴 안에서 1부터. */
  index: number;
  /** code_interpreter_call 의 status (completed, failed, incomplete, interpreting 등). */
  status: string;
  code: string;
  code_truncated?: boolean;
  logs: string;
  logs_truncated?: boolean;
  figures: StoredAnalysisFigure[];
  /** 크기 상한이나 저장 실패로 남기지 못한 그림 수. */
  figures_dropped?: number;
};

export type StoredAnalysisFile = {
  /** 교수가 올린 원래 파일 이름. */
  name: string;
  /** 컨테이너 안 경로. */
  path: string;
  /** OpenAI Files API id. 서버 전용. 컨테이너를 다시 만들 때 재사용한다. */
  file_id: string;
  /** 원본 자료 URL. 공개 자료가 바뀌었는지 비교한다. */
  source: string;
};

export const ANALYSIS_OUTCOMES = [
  "completed",
  "incomplete",
  "cell_limit",
  "time_limit",
  "quota_exhausted",
  "rate_limited",
  "upstream_error",
  "client_cancelled",
] as const;
export type AnalysisOutcome = (typeof ANALYSIS_OUTCOMES)[number];

/** 정상으로 끝난 턴. 나머지는 실패로 기록한 턴이다. */
export function isSuccessfulOutcome(outcome: AnalysisOutcome): boolean {
  return outcome === "completed" || outcome === "incomplete";
}

export const ANALYSIS_NOTICES = ["environment_restarted"] as const;
export type AnalysisNotice = (typeof ANALYSIS_NOTICES)[number];

export type StoredAnalysisTurn = {
  v: typeof ANALYSIS_METADATA_VERSION;
  /** 서버 전용. 이 턴이 쓴 컨테이너. */
  container_id: string;
  files: StoredAnalysisFile[];
  /** 컨테이너를 준비할 때 본 공개 데이터 URL 전부(못 받아 건너뛴 것 포함). 서버 전용. */
  sources?: string[];
  cells: StoredAnalysisCell[];
  /** 최종 답변의 파일 인용(container_file_citation)으로 받은 그림. 셀 출력과 같은 그림은 빠진다. */
  cited_figures: StoredAnalysisFigure[];
  outcome: AnalysisOutcome;
  notices: AnalysisNotice[];
  /** 만료 복구로 다시 실행하라고 넣은 이전 셀 수. */
  replayed_cells?: number;
  elapsed_ms: number;
};

// ---------------------------------------------------------------------------
// 그림 경로
// ---------------------------------------------------------------------------

/** 셀 그림 파일 이름. 셀의 첫 그림은 `3.png`, 둘째부터 `3-2.png`. */
export function cellFigureFileName(cellIndex: number, nth: number, mime: AnalysisFigureMime): string {
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  return nth <= 1 ? `${cellIndex}.${ext}` : `${cellIndex}-${nth}.${ext}`;
}

/** 파일 인용 그림 파일 이름. `f1.png` 부터. */
export function citedFigureFileName(nth: number, mime: AnalysisFigureMime): string {
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  return `f${nth}.${ext}`;
}

/** 라우트가 받는 그림 파일 이름의 모양. 경로 조작(`..`, `/`)을 막는다. */
export const FIGURE_FILE_NAME_RE = /^(?:\d{1,2}(?:-\d{1,2})?|f\d{1,2})\.(?:png|jpg)$/;

export function figureStoragePath(sessionId: string, messageId: string, fileName: string): string {
  return `${sessionId}/${messageId}/${fileName}`;
}

/** 화면이 그림을 여는 주소. 권한 확인 라우트다. */
export function figureUrl(sessionId: string, messageId: string, fileName: string): string {
  return `/api/session/${encodeURIComponent(sessionId)}/analysis/figures/${encodeURIComponent(messageId)}/${encodeURIComponent(fileName)}`;
}

function fileNameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** 이 턴 기록에 실제로 있는 그림 경로인지. 그림 라우트가 아무 경로나 서명하지 않게 한다. */
export function isFigureListed(turn: StoredAnalysisTurn, path: string): boolean {
  for (const cell of turn.cells) {
    if (cell.figures.some((figure) => figure.path === path)) return true;
  }
  return turn.cited_figures.some((figure) => figure.path === path);
}

// ---------------------------------------------------------------------------
// 읽기 (jsonb 에서 모양 확인)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFigure(value: unknown): StoredAnalysisFigure | null {
  if (!isRecord(value)) return null;
  const { path, mime, bytes, sha256 } = value;
  if (typeof path !== "string" || !path) return null;
  if (mime !== "image/png" && mime !== "image/jpeg") return null;
  return {
    path,
    mime,
    bytes: typeof bytes === "number" ? bytes : 0,
    sha256: typeof sha256 === "string" ? sha256 : "",
  };
}

function readFigures(value: unknown): StoredAnalysisFigure[] {
  if (!Array.isArray(value)) return [];
  return value.map(readFigure).filter((figure): figure is StoredAnalysisFigure => figure !== null);
}

function readCell(value: unknown): StoredAnalysisCell | null {
  if (!isRecord(value)) return null;
  if (typeof value.index !== "number" || typeof value.code !== "string") return null;
  return {
    index: value.index,
    status: typeof value.status === "string" ? value.status : "unknown",
    code: value.code,
    ...(value.code_truncated === true ? { code_truncated: true } : {}),
    logs: typeof value.logs === "string" ? value.logs : "",
    ...(value.logs_truncated === true ? { logs_truncated: true } : {}),
    figures: readFigures(value.figures),
    ...(typeof value.figures_dropped === "number" && value.figures_dropped > 0
      ? { figures_dropped: value.figures_dropped }
      : {}),
  };
}

function readFile(value: unknown): StoredAnalysisFile | null {
  if (!isRecord(value)) return null;
  const { name, path, file_id, source } = value;
  if (typeof path !== "string" || typeof file_id !== "string") return null;
  return {
    name: typeof name === "string" ? name : "",
    path,
    file_id,
    source: typeof source === "string" ? source : "",
  };
}

/** `messages.metadata` 에서 분석 턴 기록을 읽는다. 없거나 모양이 틀리면 null. */
export function readStoredAnalysisTurn(metadata: unknown): StoredAnalysisTurn | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata.analysis;
  if (!isRecord(raw)) return null;
  if (raw.v !== ANALYSIS_METADATA_VERSION) return null;
  if (typeof raw.container_id !== "string" || !raw.container_id) return null;
  const outcome = (ANALYSIS_OUTCOMES as readonly string[]).includes(raw.outcome as string)
    ? (raw.outcome as AnalysisOutcome)
    : null;
  if (!outcome) return null;
  return {
    v: ANALYSIS_METADATA_VERSION,
    container_id: raw.container_id,
    files: Array.isArray(raw.files)
      ? raw.files.map(readFile).filter((f): f is StoredAnalysisFile => f !== null)
      : [],
    ...(Array.isArray(raw.sources)
      ? { sources: raw.sources.filter((u): u is string => typeof u === "string") }
      : {}),
    cells: Array.isArray(raw.cells)
      ? raw.cells.map(readCell).filter((c): c is StoredAnalysisCell => c !== null)
      : [],
    cited_figures: readFigures(raw.cited_figures),
    outcome,
    notices: Array.isArray(raw.notices)
      ? raw.notices.filter((n): n is AnalysisNotice => (ANALYSIS_NOTICES as readonly unknown[]).includes(n))
      : [],
    ...(typeof raw.replayed_cells === "number" ? { replayed_cells: raw.replayed_cells } : {}),
    elapsed_ms: typeof raw.elapsed_ms === "number" ? raw.elapsed_ms : 0,
  };
}

// ---------------------------------------------------------------------------
// 화면으로 내려보내는 모양 (서버 전용 값을 뺀다)
// ---------------------------------------------------------------------------

export type ClientAnalysisFigure = { url: string; name: string };

export type ClientAnalysisCell = {
  index: number;
  status: string;
  code: string;
  codeTruncated: boolean;
  logs: string;
  logsTruncated: boolean;
  figures: ClientAnalysisFigure[];
  figuresDropped: number;
};

export type ClientAnalysisTurn = {
  messageId: string;
  outcome: AnalysisOutcome;
  notices: AnalysisNotice[];
  cells: ClientAnalysisCell[];
  /** 파일 인용으로 받은 그림(셀 출력에 없던 것). */
  figures: ClientAnalysisFigure[];
};

function toClientFigure(sessionId: string, messageId: string, figure: StoredAnalysisFigure): ClientAnalysisFigure {
  const name = fileNameOf(figure.path);
  return { url: figureUrl(sessionId, messageId, name), name };
}

/**
 * 화면용 기록. 컨테이너 id, OpenAI 파일 id, 버킷 경로를 빼고, 그림은 권한 확인 라우트 주소로 바꾼다.
 * 그림 경로가 이 메시지의 것이 아니면(다른 세션이나 메시지 경로) 내려보내지 않는다.
 */
export function toClientAnalysisTurn(params: {
  sessionId: string;
  messageId: string;
  turn: StoredAnalysisTurn;
}): ClientAnalysisTurn {
  const { sessionId, messageId, turn } = params;
  const prefix = `${sessionId}/${messageId}/`;
  const own = (figure: StoredAnalysisFigure) =>
    figure.path.startsWith(prefix) && FIGURE_FILE_NAME_RE.test(fileNameOf(figure.path));
  return {
    messageId,
    outcome: turn.outcome,
    notices: [...turn.notices],
    cells: turn.cells.map((cell) => ({
      index: cell.index,
      status: cell.status,
      code: cell.code,
      codeTruncated: cell.code_truncated === true,
      logs: cell.logs,
      logsTruncated: cell.logs_truncated === true,
      figures: cell.figures.filter(own).map((figure) => toClientFigure(sessionId, messageId, figure)),
      figuresDropped: cell.figures_dropped ?? 0,
    })),
    figures: turn.cited_figures.filter(own).map((figure) => toClientFigure(sessionId, messageId, figure)),
  };
}
