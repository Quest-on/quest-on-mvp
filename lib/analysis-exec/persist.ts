/**
 * 분석 턴의 그림 저장과 기록 조립 (이슈 #545)
 *
 * 그림은 비공개 버킷 `analysis-outputs` 의 `세션/메시지/파일이름` 에 둔다. 메타데이터에는 경로만 남는다.
 *   - 셀 출력 그림(data URI)은 셀 번호로 이름을 붙인다(`3.png`, `3-2.png`).
 *   - 최종 답변의 파일 인용 그림은 컨테이너에서 내려받아 `f1.png` 부터 붙인다. 셀 출력과 같은 그림(해시 같음)은
 *     다시 올리지 않는다(스파이크 T4 turn6: 같은 그림이 두 경로로 왔다).
 * 업로드가 실패한 그림은 버리고 셀에 버린 수를 적는다. 그림 하나 때문에 턴 전체를 실패로 만들지 않는다.
 */

import { sha256Hex, sniffImageMime, type CollectedCell } from "@/lib/analysis-exec/cells";
import { MAX_CITED_FIGURE_DOWNLOADS, MAX_FIGURE_BYTES } from "@/lib/analysis-exec/limits";
import {
  ANALYSIS_METADATA_VERSION,
  cellFigureFileName,
  citedFigureFileName,
  figureStoragePath,
  type AnalysisFigureMime,
  type AnalysisNotice,
  type AnalysisOutcome,
  type StoredAnalysisCell,
  type StoredAnalysisFigure,
  type StoredAnalysisFile,
  type StoredAnalysisTurn,
} from "@/lib/analysis-exec/metadata";
import type { FileCitation } from "@/lib/analysis-exec/text";

export type FigureStore = {
  /** 그림 하나를 올린다. 성공하면 true. 던지지 않는다. */
  upload(path: string, bytes: Uint8Array, mime: AnalysisFigureMime): Promise<boolean>;
};

/** 셀 그림을 올리고 저장용 셀 기록을 만든다. 업로드는 병렬이다. */
export async function storeCellFigures(params: {
  store: FigureStore;
  sessionId: string;
  messageId: string;
  cells: ReadonlyArray<CollectedCell>;
}): Promise<StoredAnalysisCell[]> {
  const { store, sessionId, messageId } = params;
  return Promise.all(
    params.cells.map(async (cell) => {
      const uploads = cell.figures.map(async (figure, i) => {
        const path = figureStoragePath(sessionId, messageId, cellFigureFileName(cell.index, i + 1, figure.mime));
        const ok = await store.upload(path, figure.bytes, figure.mime);
        return ok ? ({ path, mime: figure.mime, bytes: figure.bytes.byteLength, sha256: figure.sha256 } as StoredAnalysisFigure) : null;
      });
      const stored = (await Promise.all(uploads)).filter((f): f is StoredAnalysisFigure => f !== null);
      const dropped = cell.figuresDropped + (cell.figures.length - stored.length);
      return {
        index: cell.index,
        status: cell.status,
        code: cell.code,
        ...(cell.codeTruncated ? { code_truncated: true } : {}),
        logs: cell.logs,
        ...(cell.logsTruncated ? { logs_truncated: true } : {}),
        figures: stored,
        ...(dropped > 0 ? { figures_dropped: dropped } : {}),
      };
    })
  );
}

/**
 * 파일 인용 그림을 내려받아 올린다. 이미 셀 출력으로 저장한 그림(해시 같음)과 같은 인용 안의 중복은 건너뛴다.
 * 내려받기는 최대 6개, 그림 자리(`takeSlot`)가 남아 있을 때만 한다. 실패한 그림은 버린다.
 */
export async function storeCitedFigures(params: {
  store: FigureStore;
  sessionId: string;
  messageId: string;
  citations: ReadonlyArray<FileCitation>;
  download: (citation: FileCitation) => Promise<Uint8Array | null>;
  knownHashes: Set<string>;
  takeSlot: () => boolean;
}): Promise<StoredAnalysisFigure[]> {
  const stored: StoredAnalysisFigure[] = [];
  const hashes = new Set(params.knownHashes);
  for (const citation of params.citations.slice(0, MAX_CITED_FIGURE_DOWNLOADS)) {
    let bytes: Uint8Array | null = null;
    try {
      bytes = await params.download(citation);
    } catch {
      bytes = null;
    }
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_FIGURE_BYTES) continue;
    const mime = sniffImageMime(bytes);
    if (!mime) continue;
    const sha = sha256Hex(bytes);
    if (hashes.has(sha)) continue;
    if (!params.takeSlot()) break;
    const path = figureStoragePath(params.sessionId, params.messageId, citedFigureFileName(stored.length + 1, mime));
    if (await params.store.upload(path, bytes, mime)) {
      stored.push({ path, mime, bytes: bytes.byteLength, sha256: sha });
      hashes.add(sha);
    }
  }
  return stored;
}

/** 저장할 분석 턴 기록(`messages.metadata.analysis`). */
export function buildStoredTurn(params: {
  containerId: string;
  files: StoredAnalysisFile[];
  cells: StoredAnalysisCell[];
  citedFigures: StoredAnalysisFigure[];
  outcome: AnalysisOutcome;
  notices: AnalysisNotice[];
  replayedCells: number;
  elapsedMs: number;
}): StoredAnalysisTurn {
  return {
    v: ANALYSIS_METADATA_VERSION,
    container_id: params.containerId,
    files: params.files,
    cells: params.cells,
    cited_figures: params.citedFigures,
    outcome: params.outcome,
    notices: params.notices,
    ...(params.replayedCells > 0 ? { replayed_cells: params.replayedCells } : {}),
    elapsed_ms: Math.max(0, Math.round(params.elapsedMs)),
  };
}
