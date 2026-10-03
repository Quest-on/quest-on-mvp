/**
 * 코드 셀 수집 (이슈 #545)
 *
 * Responses 스트림에서 `code_interpreter_call` 항목을 셀로 모은다. 스파이크 T4 의 이벤트 순서를 따른다:
 *   - `response.output_item.added` (code_interpreter_call, outputs 빈 배열) — 셀이 시작됐다. 여기서 센다.
 *   - `response.output_item.done` (code_interpreter_call, outputs 채워짐) — 코드, 상태, 로그, 그림이 여기 있다.
 * 완료 이벤트와 `response.completed` 사이에 같은 항목이 다시 오면(id 같음) 한 번만 센다.
 *
 * 상한은 서버가 센다(`max_tool_calls` 는 code_interpreter 에 효과가 없다). 셀이 상한을 넘어 **시작되는** 순간
 * 호출부가 스트림을 닫는다. 그래서 상한은 시작 수로 판단한다.
 *
 * 그림은 data URI(`data:image/png;base64,...`)로 온다. 바로 바이트로 풀어 둔다(URL 이 아니라 만료가 없다).
 * 저장(Storage 업로드)은 호출부가 한다. 이 모듈은 순수하다(해시만 node:crypto 를 쓴다).
 */

import { createHash } from "node:crypto";
import {
  ANALYSIS_MAX_CELLS_PER_TURN,
  CELL_CODE_MAX_CHARS,
  CELL_LOGS_MAX_CHARS,
  MAX_FIGURE_BYTES,
  MAX_FIGURES_PER_TURN,
} from "@/lib/analysis-exec/limits";
import type { AnalysisFigureMime } from "@/lib/analysis-exec/metadata";

export type CollectedFigure = {
  mime: AnalysisFigureMime;
  bytes: Uint8Array;
  sha256: string;
};

export type CollectedCell = {
  index: number;
  itemId: string | null;
  status: string;
  code: string;
  codeTruncated: boolean;
  logs: string;
  logsTruncated: boolean;
  figures: CollectedFigure[];
  /** 크기 상한, 턴 그림 수 상한, 해석 실패로 버린 그림 수. */
  figuresDropped: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 글자 상한으로 자른다. 잘렸는지 함께 돌려준다. */
export function capText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

/**
 * `data:image/png;base64,...` 를 바이트로 푼다. png 와 jpeg 만 받는다. 그 밖(URL, 다른 형식, 깨진 base64,
 * 상한 초과)은 null.
 */
export function decodeImageDataUri(url: unknown, maxBytes: number = MAX_FIGURE_BYTES): { mime: AnalysisFigureMime; bytes: Uint8Array } | null {
  if (typeof url !== "string") return null;
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!match) return null;
  const mime: AnalysisFigureMime = match[1] === "image/png" ? "image/png" : "image/jpeg";
  const b64 = match[2].replace(/\s+/g, "");
  // base64 길이로 미리 크기를 본다(디코드 전에 메모리를 아낀다).
  if (Math.floor((b64.length * 3) / 4) > maxBytes + 3) return null;
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  // 형식 서명 확인: png 는 89 50 4E 47, jpeg 는 FF D8.
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === "image/png" ? !isPng : !isJpeg) return null;
  return { mime, bytes };
}

/** 그림 바이트의 형식을 서명으로 판단한다(파일 인용 내려받기용). */
export function sniffImageMime(bytes: Uint8Array): AnalysisFigureMime | null {
  if (bytes.byteLength >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return null;
}

export class CellCollector {
  private readonly maxCells: number;
  private readonly maxFigures: number;
  private readonly startedIds = new Set<string>();
  private anonymousStarts = 0;
  private readonly doneIds = new Set<string>();
  private figureCount = 0;
  readonly cells: CollectedCell[] = [];

  constructor(options?: { maxCells?: number; maxFigures?: number }) {
    this.maxCells = options?.maxCells ?? ANALYSIS_MAX_CELLS_PER_TURN;
    this.maxFigures = options?.maxFigures ?? MAX_FIGURES_PER_TURN;
  }

  /** 시작된 셀 수(중복 없이). */
  get startedCount(): number {
    return this.startedIds.size + this.anonymousStarts;
  }

  /** 시작된 셀이 상한을 넘었는가. 넘었으면 호출부가 스트림을 닫는다. */
  get exceeded(): boolean {
    return this.startedCount > this.maxCells;
  }

  /**
   * `response.output_item.added` 의 항목. code_interpreter_call 이면 시작으로 센다.
   * 새로 시작된 셀이면 그 번호(1부터)를, 아니면 null 을 돌려준다.
   */
  onItemAdded(item: unknown): number | null {
    if (!isRecord(item) || item.type !== "code_interpreter_call") return null;
    const id = typeof item.id === "string" && item.id ? item.id : null;
    if (id) {
      if (this.startedIds.has(id)) return null;
      this.startedIds.add(id);
    } else {
      this.anonymousStarts += 1;
    }
    return this.startedCount;
  }

  /**
   * `response.output_item.done` 의 항목. code_interpreter_call 이면 셀로 모으고 그 셀을 돌려준다.
   * 같은 id 가 다시 오면 무시한다. 시작 이벤트 없이 완료만 와도 시작으로 센다.
   */
  onItemDone(item: unknown): CollectedCell | null {
    if (!isRecord(item) || item.type !== "code_interpreter_call") return null;
    const id = typeof item.id === "string" && item.id ? item.id : null;
    if (id) {
      if (this.doneIds.has(id)) return null;
      this.doneIds.add(id);
      if (!this.startedIds.has(id)) this.startedIds.add(id);
    }

    const code = capText(typeof item.code === "string" ? item.code : "", CELL_CODE_MAX_CHARS);
    const logParts: string[] = [];
    const figures: CollectedFigure[] = [];
    let dropped = 0;

    const outputs = Array.isArray(item.outputs) ? item.outputs : [];
    for (const output of outputs) {
      if (!isRecord(output)) continue;
      if (output.type === "logs" && typeof output.logs === "string") {
        logParts.push(output.logs);
      } else if (output.type === "image") {
        if (this.figureCount >= this.maxFigures) {
          dropped += 1;
          continue;
        }
        const decoded = decodeImageDataUri(output.url);
        if (!decoded) {
          dropped += 1;
          continue;
        }
        const sha = sha256Hex(decoded.bytes);
        // 한 셀 안에서 같은 그림이 두 번 오면 한 장만 둔다.
        if (figures.some((f) => f.sha256 === sha)) continue;
        figures.push({ mime: decoded.mime, bytes: decoded.bytes, sha256: sha });
        this.figureCount += 1;
      }
    }

    const logs = capText(logParts.join(""), CELL_LOGS_MAX_CHARS);
    const cell: CollectedCell = {
      index: this.cells.length + 1,
      itemId: id,
      status: typeof item.status === "string" ? item.status : "unknown",
      code: code.text,
      codeTruncated: code.truncated,
      logs: logs.text,
      logsTruncated: logs.truncated,
      figures,
      figuresDropped: dropped,
    };
    this.cells.push(cell);
    return cell;
  }

  /** 지금까지 모은 그림의 해시. 파일 인용 그림의 중복을 거를 때 쓴다. */
  figureHashes(): Set<string> {
    const hashes = new Set<string>();
    for (const cell of this.cells) for (const figure of cell.figures) hashes.add(figure.sha256);
    return hashes;
  }

  /** 남은 그림 자리(턴 상한 기준). */
  get remainingFigureSlots(): number {
    return Math.max(0, this.maxFigures - this.figureCount);
  }

  /** 파일 인용 그림을 하나 받았을 때 자리를 쓴다. */
  takeFigureSlot(): boolean {
    if (this.figureCount >= this.maxFigures) return false;
    this.figureCount += 1;
    return true;
  }
}
