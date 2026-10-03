/**
 * 분석 실행 단위 모듈 (이슈 #545): 셀 수집과 상한, 오류 분류, 답변 텍스트 정리, 저장 기록 모양, 켜지는 조건,
 * 컨테이너 준비와 만료 복구 입력(복원 파일, 이력 출처, 다시 복원), 문항 간 연결과 중단된 요청의 입력.
 *
 * OpenAI 는 부르지 않는다. 컨테이너 연산은 가짜 객체로 바꾼다.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/student-materials", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getStudentVisibleMaterials: vi.fn(() => {
    throw new Error("column student_materials does not exist");
  }),
}));

import { CellCollector, capText, decodeImageDataUri, sniffImageMime } from "@/lib/analysis-exec/cells";
import {
  OpenAIHttpError,
  classifyOpenAIFailure,
  parseRetryAfterMs,
  rateLimitWaitMs,
} from "@/lib/analysis-exec/errors";
import { ANALYSIS_MAX_CELLS_PER_TURN, CELL_CODE_MAX_CHARS, CELL_LOGS_MAX_CHARS } from "@/lib/analysis-exec/limits";
import { collectImageCitations, collectOutputText, stripSandboxLinks } from "@/lib/analysis-exec/text";
import {
  FIGURE_FILE_NAME_RE,
  cellFigureFileName,
  figureStoragePath,
  isFigureListed,
  readStoredAnalysisTurn,
  toClientAnalysisTurn,
  type StoredAnalysisTurn,
} from "@/lib/analysis-exec/metadata";
import {
  decideAnalysisExecution,
  listStudentVisibleMaterials,
  normalizeDataExtension,
  withOriginalFileNames,
} from "@/lib/analysis-exec/eligibility";
import {
  AnalysisSetupError,
  INTERRUPTED_CODE_HEADER,
  LINKED_CODE_HEADER,
  REPLAY_FILE_NAME,
  REPLAY_INSTRUCTION_HEADER,
  REPLAY_MARKER,
  applyPathRewrites,
  buildFileRestoreInstruction,
  buildInterruptedCodeInstruction,
  buildLinkedCodeInstruction,
  buildReplayInstruction,
  buildReplayScript,
  capCells,
  collectContainerHistory,
  collectLinkedCells,
  collectUnseenCells,
  ensureAnalysisContainer,
  historyPathRewrites,
  isReplayCellCode,
  parseReplayResult,
  replayExecLine,
  restoreNeedsRetry,
  toAsciiUploadName,
  type ContainerOps,
  type HistoryRecord,
} from "@/lib/analysis-exec/container";
import { buildStoredTurn, storeCellFigures, storeCitedFigures } from "@/lib/analysis-exec/persist";
import { resolveExamAiProfile } from "@/lib/exam-ai-profile";
import {
  DATA_SOURCE_DOWNLOAD_TIMEOUT_MS,
  createFigureStore,
  downloadDataSource,
  materialObjectPath,
} from "@/lib/analysis-exec/session-records";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_URI = `data:image/png;base64,${PNG_B64}`;
const PNG2_URI = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64")}`;
const JPEG_URI = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`;

function ciItem(id: string, extra: Record<string, unknown> = {}) {
  return { type: "code_interpreter_call", id, status: "completed", code: `print(${JSON.stringify(id)})`, outputs: [], ...extra };
}

describe("CellCollector: 셀 수집과 상한", () => {
  it("added 로 시작을 세고 done 에서 코드, 상태, 로그, 그림을 모은다", () => {
    const c = new CellCollector();
    expect(c.onItemAdded({ type: "message", id: "m1" })).toBeNull();
    expect(c.onItemAdded(ciItem("a"))).toBe(1);
    const cell = c.onItemDone(
      ciItem("a", {
        outputs: [
          { type: "logs", logs: "shape (500, 10)\n" },
          { type: "image", url: PNG_URI },
          { type: "logs", logs: "끝\n" },
        ],
      })
    );
    expect(cell).toMatchObject({ index: 1, itemId: "a", status: "completed", logs: "shape (500, 10)\n끝\n" });
    expect(cell?.figures).toHaveLength(1);
    expect(cell?.figures[0].mime).toBe("image/png");
    expect(cell?.figures[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("같은 id 가 다시 오면 한 번만 센다(완료 응답에 셀이 다시 들어온다)", () => {
    const c = new CellCollector();
    c.onItemAdded(ciItem("a"));
    c.onItemAdded(ciItem("a"));
    c.onItemDone(ciItem("a"));
    expect(c.onItemDone(ciItem("a"))).toBeNull();
    expect(c.startedCount).toBe(1);
    expect(c.cells).toHaveLength(1);
  });

  it(`상한(${ANALYSIS_MAX_CELLS_PER_TURN})까지는 넘지 않고 그 다음 셀이 시작되면 넘는다`, () => {
    const c = new CellCollector();
    for (let i = 1; i <= ANALYSIS_MAX_CELLS_PER_TURN; i++) {
      c.onItemAdded(ciItem(`c${i}`));
      expect(c.exceeded, `셀 ${i}`).toBe(false);
    }
    c.onItemAdded(ciItem("c13"));
    expect(c.exceeded).toBe(true);
  });

  it("시작 이벤트 없이 완료만 와도 시작으로 센다", () => {
    const c = new CellCollector({ maxCells: 1 });
    c.onItemDone(ciItem("x"));
    c.onItemDone(ciItem("y"));
    expect(c.startedCount).toBe(2);
    expect(c.exceeded).toBe(true);
  });

  it("코드와 로그는 상한에서 자르고 잘렸다고 표시한다", () => {
    const c = new CellCollector();
    const cell = c.onItemDone(
      ciItem("a", {
        code: "x".repeat(CELL_CODE_MAX_CHARS + 5),
        outputs: [{ type: "logs", logs: "y".repeat(CELL_LOGS_MAX_CHARS + 5) }],
      })
    );
    expect(cell?.code.length).toBe(CELL_CODE_MAX_CHARS);
    expect(cell?.codeTruncated).toBe(true);
    expect(cell?.logs.length).toBe(CELL_LOGS_MAX_CHARS);
    expect(cell?.logsTruncated).toBe(true);
  });

  it("그림이 아니거나 깨진 출력은 버리고 버린 수를 센다. 같은 그림은 한 셀에서 한 장만", () => {
    const c = new CellCollector();
    const cell = c.onItemDone(
      ciItem("a", {
        outputs: [
          { type: "image", url: "https://example.test/x.png" },
          { type: "image", url: "data:image/gif;base64,R0lGOD" },
          { type: "image", url: "data:image/png;base64,AAAA" }, // png 서명이 아님
          { type: "image", url: PNG_URI },
          { type: "image", url: PNG_URI },
          { type: "image", url: JPEG_URI },
        ],
      })
    );
    expect(cell?.figures.map((f) => f.mime)).toEqual(["image/png", "image/jpeg"]);
    expect(cell?.figuresDropped).toBe(3);
  });

  it("턴 그림 수 상한을 넘는 그림은 버린다", () => {
    const c = new CellCollector({ maxFigures: 1 });
    const cell = c.onItemDone(ciItem("a", { outputs: [{ type: "image", url: PNG_URI }, { type: "image", url: PNG2_URI }] }));
    expect(cell?.figures).toHaveLength(1);
    expect(cell?.figuresDropped).toBe(1);
    expect(c.takeFigureSlot()).toBe(false);
  });

  it("decodeImageDataUri 는 크기 상한을 넘으면 null", () => {
    expect(decodeImageDataUri(PNG_URI, 10)).toBeNull();
    expect(decodeImageDataUri(PNG_URI)?.bytes.byteLength).toBeGreaterThan(10);
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0x00]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x25, 0x50]))).toBeNull();
    expect(capText("abc", 5)).toEqual({ text: "abc", truncated: false });
  });
});

describe("오류 분류: 잔액 소진 vs 일반 429 vs 컨테이너 만료", () => {
  it("credit_balance_exhausted 와 insufficient_quota 는 429 여도 잔액 소진이다(재시도 금지)", () => {
    expect(classifyOpenAIFailure({ status: 429, code: "credit_balance_exhausted", type: "insufficient_quota" })).toBe(
      "quota_exhausted"
    );
    expect(classifyOpenAIFailure({ status: 429, code: null, type: "insufficient_quota" })).toBe("quota_exhausted");
    expect(classifyOpenAIFailure({ status: null, code: "insufficient_quota" })).toBe("quota_exhausted");
  });

  it("그 밖의 429(TPM, RPM)는 rate_limited 다", () => {
    expect(
      classifyOpenAIFailure({ status: 429, code: "rate_limit_exceeded", message: "Rate limit reached ... on tokens per min (TPM)" })
    ).toBe("rate_limited");
    expect(classifyOpenAIFailure({ status: 429 })).toBe("rate_limited");
    expect(classifyOpenAIFailure({ status: null, code: "rate_limit_exceeded" })).toBe("rate_limited");
  });

  it("Container is expired 는 400(응답)과 404(파일) 모두 만료다", () => {
    expect(classifyOpenAIFailure({ status: 400, message: "Container is expired." })).toBe("container_expired");
    expect(classifyOpenAIFailure({ status: 404, message: "Container is expired." })).toBe("container_expired");
  });

  it("상태 코드가 없고 코드도 없으면 network, 있으면 upstream", () => {
    expect(classifyOpenAIFailure({ status: null })).toBe("network");
    expect(classifyOpenAIFailure({ status: null, code: "server_error" })).toBe("upstream");
    expect(classifyOpenAIFailure({ status: 500 })).toBe("upstream");
  });

  it("OpenAIHttpError 는 만들 때 종류를 정한다", () => {
    expect(new OpenAIHttpError({ message: "x", status: 429, code: "credit_balance_exhausted" }).kind).toBe("quota_exhausted");
    expect(new OpenAIHttpError({ message: "Container is expired.", status: 400 }).kind).toBe("container_expired");
  });

  it("retry-after-ms, retry-after(초), 오류 문장 순서로 대기 시간을 읽는다", () => {
    const h = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null });
    expect(parseRetryAfterMs(h({ "retry-after-ms": "1782", "retry-after": "2" }))).toBe(1782);
    expect(parseRetryAfterMs(h({ "retry-after": "2" }))).toBe(2000);
    expect(parseRetryAfterMs(h({}), "Please try again in 1.782s.")).toBe(1782);
    expect(parseRetryAfterMs(h({}), "Please try again in 350ms.")).toBe(350);
    expect(parseRetryAfterMs(h({}), "nothing")).toBeNull();
  });

  it("재시도 대기는 0.5초~10초로 묶고, 남은 예산이 부족하면 재시도하지 않는다", () => {
    expect(rateLimitWaitMs(null, 200_000)).toBe(2_000);
    expect(rateLimitWaitMs(100, 200_000)).toBe(500);
    expect(rateLimitWaitMs(60_000, 200_000)).toBe(10_000);
    expect(rateLimitWaitMs(2_000, 20_000)).toBeNull();
  });
});

describe("답변 텍스트 정리", () => {
  it("sandbox 그림은 지우고 링크는 이름만, 맨 경로는 파일 이름만 남긴다", () => {
    const text = [
      "결과입니다.",
      "![산점도](sandbox:/mnt/data/pca.png)",
      "[CSV 내려받기](sandbox:/mnt/data/out/coords.csv) 를 참고하세요.",
      "경로: sandbox:/mnt/data/elbow.png",
    ].join("\n");
    const out = stripSandboxLinks(text);
    expect(out).not.toContain("sandbox:");
    expect(out).not.toContain("![산점도]");
    expect(out).toContain("CSV 내려받기 를 참고하세요.");
    expect(out).toContain("경로: elbow.png");
  });

  it("파일 인용 중 그림만 같은 파일 한 번씩 모은다", () => {
    const output = [
      { type: "code_interpreter_call", id: "ci" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "a",
            annotations: [
              { type: "container_file_citation", container_id: "cntr_1", file_id: "cfile_1", filename: "pca.png" },
              { type: "container_file_citation", container_id: "cntr_1", file_id: "cfile_1", filename: "pca.png" },
              { type: "container_file_citation", container_id: "cntr_1", file_id: "cfile_2", filename: "coords.csv" },
              { type: "url_citation", url: "https://x" },
            ],
          },
        ],
      },
    ];
    expect(collectImageCitations(output)).toEqual([{ containerId: "cntr_1", fileId: "cfile_1", filename: "pca.png" }]);
  });

  it("도구 호출 앞뒤의 message 를 모두 빈 줄로 잇는다", () => {
    const output = [
      { type: "message", content: [{ type: "output_text", text: "먼저 읽겠습니다." }] },
      { type: "code_interpreter_call", id: "ci" },
      { type: "message", content: [{ type: "output_text", text: "## 결과" }, { type: "output_text", text: "\n표" }] },
    ];
    expect(collectOutputText(output)).toBe("먼저 읽겠습니다.\n\n## 결과\n표");
  });
});

const SID = "00000000-0000-4000-8000-0000000000aa";
const MID = "00000000-0000-4000-8000-0000000000bb";

function storedTurn(overrides: Partial<StoredAnalysisTurn> = {}): StoredAnalysisTurn {
  return {
    v: 1,
    container_id: "cntr_secret",
    files: [{ name: "고객.xlsx", path: "/mnt/data/file-abc-dataset.xlsx", file_id: "file-abc", source: "https://x/a.xlsx" }],
    cells: [
      {
        index: 1,
        status: "completed",
        code: "print(1)",
        logs: "1\n",
        figures: [{ path: `${SID}/${MID}/1.png`, mime: "image/png", bytes: 10, sha256: "h1" }],
      },
    ],
    cited_figures: [
      { path: `${SID}/${MID}/f1.png`, mime: "image/png", bytes: 10, sha256: "h2" },
      { path: `other-session/${MID}/f2.png`, mime: "image/png", bytes: 10, sha256: "h3" },
    ],
    outcome: "completed",
    notices: ["environment_restarted"],
    elapsed_ms: 1234,
    ...overrides,
  };
}

describe("검토 반영: 링크 괄호와 화면용 그림 경로", () => {
  it("파일 이름에 괄호가 있는 sandbox 링크도 이름만 남긴다", () => {
    expect(stripSandboxLinks("결과는 [파일](sandbox:/mnt/data/clusters (1).csv) 입니다.")).toBe("결과는 파일 입니다.");
    expect(stripSandboxLinks("그림 ![산점도](sandbox:/mnt/data/plot (2).png) 끝")).toBe("그림  끝");
  });

  it("화면용 기록은 이 메시지 경로의 그림만 내려보낸다(다른 세션, 다른 메시지, 이름 모양이 틀린 경로 제외)", () => {
    const turn = storedTurn({
      cells: [
        {
          index: 1,
          status: "completed",
          code: "plot()",
          logs: "",
          figures: [
            { path: `${SID}/${MID}/1.png`, mime: "image/png", bytes: 1, sha256: "a" },
            { path: `other-session/${MID}/1-2.png`, mime: "image/png", bytes: 1, sha256: "b" },
            { path: `${SID}/other-message/1-3.png`, mime: "image/png", bytes: 1, sha256: "c" },
            { path: `${SID}/${MID}/../x.png`, mime: "image/png", bytes: 1, sha256: "d" },
          ],
        },
      ],
      cited_figures: [
        { path: `${SID}/${MID}/f1.png`, mime: "image/png", bytes: 1, sha256: "e" },
        { path: `other-session/${MID}/f2.png`, mime: "image/png", bytes: 1, sha256: "f" },
      ],
    });
    const client = toClientAnalysisTurn({ sessionId: SID, messageId: MID, turn });
    expect(client.cells[0].figures.map((f) => f.name)).toEqual(["1.png"]);
    expect(client.figures.map((f) => f.name)).toEqual(["f1.png"]);
  });
});

describe("저장 기록 모양과 화면용 기록", () => {
  it("readStoredAnalysisTurn 은 저장한 모양을 그대로 읽고, 틀린 모양은 null", () => {
    expect(readStoredAnalysisTurn({ analysis: storedTurn() })).toEqual(storedTurn());
    expect(readStoredAnalysisTurn({})).toBeNull();
    expect(readStoredAnalysisTurn({ analysis: { ...storedTurn(), v: 2 } })).toBeNull();
    expect(readStoredAnalysisTurn({ analysis: { ...storedTurn(), outcome: "weird" } })).toBeNull();
    expect(readStoredAnalysisTurn({ analysis: { ...storedTurn(), container_id: "" } })).toBeNull();
  });

  it("화면용 기록에는 컨테이너 id, 파일 id, 버킷 경로가 없고 그림은 권한 라우트 주소다", () => {
    const client = toClientAnalysisTurn({ sessionId: SID, messageId: MID, turn: storedTurn() });
    const json = JSON.stringify(client);
    expect(json).not.toContain("cntr_secret");
    expect(json).not.toContain("file-abc");
    expect(json).not.toContain("/mnt/data");
    expect(client.cells[0].figures).toEqual([
      { url: `/api/session/${SID}/analysis/figures/${MID}/1.png`, name: "1.png" },
    ]);
    // 다른 세션 경로의 그림은 내려보내지 않는다.
    expect(client.figures).toEqual([{ url: `/api/session/${SID}/analysis/figures/${MID}/f1.png`, name: "f1.png" }]);
    expect(client.notices).toEqual(["environment_restarted"]);
  });

  it("그림 경로 확인과 파일 이름 모양", () => {
    expect(isFigureListed(storedTurn(), `${SID}/${MID}/1.png`)).toBe(true);
    expect(isFigureListed(storedTurn(), `${SID}/${MID}/f1.png`)).toBe(true);
    expect(isFigureListed(storedTurn(), `${SID}/${MID}/2.png`)).toBe(false);
    for (const ok of ["1.png", "12-2.png", "f3.jpg"]) expect(FIGURE_FILE_NAME_RE.test(ok), ok).toBe(true);
    for (const bad of ["../1.png", "1.png/..", "a.png", "1.gif", "1.png.exe", ""]) {
      expect(FIGURE_FILE_NAME_RE.test(bad), bad).toBe(false);
    }
    expect(cellFigureFileName(3, 1, "image/png")).toBe("3.png");
    expect(cellFigureFileName(3, 2, "image/jpeg")).toBe("3-2.jpg");
    expect(figureStoragePath(SID, MID, "3.png")).toBe(`${SID}/${MID}/3.png`);
  });

  it("그림을 비공개 버킷 경로(세션/메시지/셀번호.png)로 올리고 실패한 그림은 버린 수로 센다", async () => {
    const uploads: string[] = [];
    const store = {
      upload: vi.fn(async (path: string) => {
        uploads.push(path);
        return !path.endsWith("-2.png");
      }),
    };
    const collector = new CellCollector();
    collector.onItemDone(ciItem("a", { outputs: [{ type: "image", url: PNG_URI }, { type: "image", url: PNG2_URI }] }));
    const cells = await storeCellFigures({ store, sessionId: SID, messageId: MID, cells: collector.cells });
    expect(uploads.sort()).toEqual([`${SID}/${MID}/1-2.png`, `${SID}/${MID}/1.png`]);
    expect(cells[0].figures.map((f) => f.path)).toEqual([`${SID}/${MID}/1.png`]);
    expect(cells[0].figures_dropped).toBe(1);
  });

  it("파일 인용 그림은 셀 그림과 같으면(해시) 올리지 않는다", async () => {
    const collector = new CellCollector();
    collector.onItemDone(ciItem("a", { outputs: [{ type: "image", url: PNG_URI }] }));
    const store = { upload: vi.fn(async () => true) };
    const same = Buffer.from(PNG_B64, "base64");
    const other = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9]);
    const cited = await storeCitedFigures({
      store,
      sessionId: SID,
      messageId: MID,
      citations: [
        { containerId: "c", fileId: "same", filename: "a.png" },
        { containerId: "c", fileId: "other", filename: "b.png" },
        { containerId: "c", fileId: "notimage", filename: "c.png" },
      ],
      download: async (c) =>
        c.fileId === "same" ? new Uint8Array(same) : c.fileId === "other" ? new Uint8Array(other) : new Uint8Array([1, 2]),
      knownHashes: collector.figureHashes(),
      takeSlot: () => collector.takeFigureSlot(),
    });
    expect(cited.map((f) => f.path)).toEqual([`${SID}/${MID}/f1.png`]);
    expect(store.upload).toHaveBeenCalledTimes(1);
  });

  it("buildStoredTurn 은 다시 실행한 셀이 없으면 replayed_cells 키를 두지 않는다", () => {
    const turn = buildStoredTurn({
      containerId: "c",
      files: [],
      cells: [],
      citedFigures: [],
      outcome: "cell_limit",
      notices: [],
      replayedCells: 0,
      elapsedMs: 12.6,
    });
    expect(turn).toEqual({
      v: 1,
      container_id: "c",
      files: [],
      cells: [],
      cited_figures: [],
      outcome: "cell_limit",
      notices: [],
      elapsed_ms: 13,
    });
  });
});

describe("켜지는 조건: 분석 파트너 + 학생 공개 데이터 파일", () => {
  const partner = resolveExamAiProfile({ exam: { language: "ko", questions: [{ ai_role: "analysis_partner" }] }, qIdx: 0 });
  const caseAuthor = resolveExamAiProfile({ exam: { language: "ko", questions: [{}] }, qIdx: 0 });
  const xlsx = { url: "https://s/exam-materials/a.xlsx", fileName: "고객.xlsx", extension: "xlsx" };
  const csv = { url: "https://s/exam-materials/b.csv", fileName: "b.csv", extension: ".CSV" };
  const pdf = { url: "https://s/exam-materials/c.pdf", fileName: "c.pdf", extension: "pdf" };

  it("분석 파트너가 아니면 데이터가 있어도 꺼진다", () => {
    expect(decideAnalysisExecution({ profile: caseAuthor, visibleMaterials: [xlsx] })).toEqual({
      enabled: false,
      reason: "not_analysis_partner",
    });
  });

  it("공개 데이터 파일이 없으면(공개 자료가 pdf 뿐) 꺼진다", () => {
    expect(decideAnalysisExecution({ profile: partner, visibleMaterials: [] })).toEqual({ enabled: false, reason: "no_data_files" });
    expect(decideAnalysisExecution({ profile: partner, visibleMaterials: [pdf] })).toEqual({ enabled: false, reason: "no_data_files" });
  });

  it("csv 만 있어도 켜진다(확장자 대소문자와 점은 정규화)", () => {
    expect(decideAnalysisExecution({ profile: partner, visibleMaterials: [pdf, csv] })).toEqual({
      enabled: true,
      dataSources: [{ url: csv.url, fileName: "b.csv", extension: "csv" }],
    });
  });

  it("xlsx 는 켜지고, 같은 URL 은 한 번만 넣는다", () => {
    const decision = decideAnalysisExecution({ profile: partner, visibleMaterials: [xlsx, xlsx, csv] });
    expect(decision.enabled && decision.dataSources.map((s) => s.extension)).toEqual(["xlsx", "csv"]);
  });

  it("영어 시험의 분석 파트너는 사례형으로 폴백하므로 꺼진다", () => {
    const en = resolveExamAiProfile({ exam: { language: "en", questions: [{ ai_role: "analysis_partner" }] }, qIdx: 0 });
    expect(decideAnalysisExecution({ profile: en, visibleMaterials: [xlsx] }).enabled).toBe(false);
  });

  it("확장자가 비면 파일 이름이나 URL 에서 읽는다", () => {
    expect(normalizeDataExtension({ url: "https://x/y.XLS?token=1", fileName: "", extension: "" })).toBe("xls");
    expect(normalizeDataExtension({ url: "https://x/y", fileName: "d.xlsx", extension: "" })).toBe("xlsx");
    expect(normalizeDataExtension({ url: "https://x/y.xlsx", fileName: "y.xlsx", extension: "pdf" })).toBeNull();
  });

  it("헬퍼가 원래 이름(material_names)을 줬으면 그대로 두고, URL 조각일 때만 텍스트 추출 기록의 이름을 쓴다", () => {
    const fromNames = [{ url: "https://s/x/2026-10-03_ccc.xlsx", fileName: "하냥센스_시험용_dataset.xlsx", extension: "xlsx" }];
    expect(
      withOriginalFileNames(fromNames, [{ url: "https://s/x/2026-10-03_ccc.xlsx", fileName: "다른 이름.xlsx" }])[0].fileName
    ).toBe("하냥센스_시험용_dataset.xlsx");
  });

  it("원래 파일 이름은 텍스트 추출 기록에서 가져오고, 없으면 그대로 둔다", () => {
    const visible = [
      { url: "https://s/2026-10-03_aaa.xlsx", fileName: "2026-10-03_aaa.xlsx", extension: "xlsx" },
      { url: "https://s/2026-10-03_bbb.csv", fileName: "2026-10-03_bbb.csv", extension: "csv" },
    ];
    expect(
      withOriginalFileNames(visible, [
        { url: "https://s/2026-10-03_aaa.xlsx", fileName: "고객 데이터.xlsx" },
        { url: "https://s/2026-10-03_bbb.csv", fileName: " " },
      ])
    ).toEqual([
      { url: "https://s/2026-10-03_aaa.xlsx", fileName: "고객 데이터.xlsx", extension: "xlsx" },
      { url: "https://s/2026-10-03_bbb.csv", fileName: "2026-10-03_bbb.csv", extension: "csv" },
    ]);
    expect(withOriginalFileNames(visible, null)).toEqual(visible);
  });

  it("에픽 A 헬퍼가 던지면(컬럼 없음) 공개 자료가 없는 것으로 본다", () => {
    const result = listStudentVisibleMaterials({ materials: [] });
    expect(result.materials).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});

function fakeOps(overrides: Partial<ContainerOps> = {}) {
  let fileSeq = 0;
  let containerSeq = 0;
  const ops: ContainerOps & { calls: string[] } = {
    calls: [],
    createContainer: vi.fn(async ({ fileIds }) => {
      ops.calls.push(`create:${fileIds.join(",")}`);
      return { id: `cntr_new${++containerSeq}`, status: "running" };
    }),
    retrieveContainer: vi.fn(async ({ containerId }) => {
      ops.calls.push(`get:${containerId}`);
      return { id: containerId, status: "running" };
    }),
    listContainerFiles: vi.fn(async () => [
      { id: "cfile_1", path: "/mnt/data/file-up1-dataset.xlsx" },
    ]),
    uploadFile: vi.fn(async ({ filename }) => {
      ops.calls.push(`upload:${filename}`);
      return { id: `file-up${++fileSeq}` };
    }),
    uploadContainerFile: vi.fn(async ({ containerId, filename }) => {
      ops.calls.push(`container-upload:${containerId}:${filename}`);
      return { id: "cfile_replay", path: `/mnt/data/abc-${filename}` };
    }),
    downloadDataSource: vi.fn(async () => ({ ok: true as const, bytes: new Uint8Array([1, 2, 3]) })),
    ...overrides,
  };
  return ops;
}

const SOURCES = [{ url: "https://s/exam-materials/a.xlsx", fileName: "하냥센스_시험용_dataset.xlsx", extension: "xlsx" as const }];

describe("컨테이너 준비와 만료 복구", () => {
  it("첫 분석 턴: ASCII 이름으로 올리고 file_ids 로 컨테이너를 만들고 경로를 목록에서 읽는다", async () => {
    const ops = fakeOps();
    const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous: null, dataSources: SOURCES });
    expect(ops.calls).toEqual(["upload:dataset.xlsx", "create:file-up1"]);
    expect(ensured).toEqual({
      containerId: "cntr_new1",
      files: [
        { name: "하냥센스_시험용_dataset.xlsx", path: "/mnt/data/file-up1-dataset.xlsx", file_id: "file-up1", source: SOURCES[0].url },
      ],
      restarted: false,
      previousContainerId: null,
      sources: [SOURCES[0].url],
      pathRewrites: [],
    });
  });

  const previous = storedTurn({
    container_id: "cntr_old",
    files: [{ name: "x.xlsx", path: "/mnt/data/file-keep-x.xlsx", file_id: "file-keep", source: SOURCES[0].url }],
  });

  it("살아 있는 컨테이너는 조회(갱신 겸용)만 하고 그대로 쓴다", async () => {
    const ops = fakeOps();
    const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: SOURCES });
    expect(ops.calls).toEqual(["get:cntr_old"]);
    expect(ensured).toMatchObject({ containerId: "cntr_old", restarted: false });
  });

  it("만료(status expired)면 같은 파일 id 로 새로 만들고 restarted 다(경로 그대로)", async () => {
    const ops = fakeOps({ retrieveContainer: vi.fn(async () => ({ id: "cntr_old", status: "expired" })) });
    const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: SOURCES });
    expect(ops.calls).toEqual(["create:file-keep"]);
    expect(ensured).toMatchObject({
      containerId: "cntr_new1",
      restarted: true,
      previousContainerId: "cntr_old",
      files: previous.files,
    });
  });

  it("조회가 404 나 Container is expired 로 실패해도 새로 만든다", async () => {
    for (const error of [
      new OpenAIHttpError({ message: "not found", status: 404 }),
      new OpenAIHttpError({ message: "Container is expired.", status: 400 }),
    ]) {
      const ops = fakeOps({ retrieveContainer: vi.fn(async () => Promise.reject(error)) });
      const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: SOURCES });
      expect(ensured.restarted).toBe(true);
    }
  });

  it("조회가 네트워크 오류면 이전 컨테이너를 그대로 쓴다(응답 호출이 만료를 알려 준다)", async () => {
    const ops = fakeOps({
      retrieveContainer: vi.fn(async () => Promise.reject(new OpenAIHttpError({ message: "socket", status: null }))),
    });
    const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: SOURCES });
    expect(ensured).toMatchObject({ containerId: "cntr_old", restarted: false });
  });

  it("잔액 소진은 그대로 던진다(재시도하지 않는다)", async () => {
    const quota = new OpenAIHttpError({ message: "no credits", status: 429, code: "credit_balance_exhausted" });
    const ops = fakeOps({ retrieveContainer: vi.fn(async () => Promise.reject(quota)) });
    await expect(ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: SOURCES })).rejects.toBe(quota);
  });

  it("재사용할 파일 id 로 만들기가 실패하면 다시 올린다", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new OpenAIHttpError({ message: "file not found", status: 404 }))
      .mockResolvedValueOnce({ id: "cntr_after", status: "running" });
    const ops = fakeOps({ createContainer: create, retrieveContainer: vi.fn(async () => ({ id: "x", status: "expired" })) });
    const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: SOURCES });
    expect(create).toHaveBeenCalledTimes(2);
    expect(ensured).toMatchObject({ containerId: "cntr_after", restarted: true, previousContainerId: "cntr_old" });
    expect(ensured.files[0].file_id).toBe("file-up1");
  });

  it("공개 자료가 바뀌었으면 새로 올려 새 컨테이너를 만든다", async () => {
    const ops = fakeOps();
    const changed = [{ url: "https://s/exam-materials/new.csv", fileName: "new.csv", extension: "csv" as const }];
    const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: changed });
    expect(ops.calls).toEqual(["upload:new.csv", "create:file-up1"]);
    expect(ensured.restarted).toBe(true);
  });

  it("데이터 파일을 하나도 읽지 못하면 준비 실패다", async () => {
    const ops = fakeOps({ downloadDataSource: vi.fn(async () => ({ ok: false as const, permanent: false })) });
    await expect(ensureAnalysisContainer(ops, { sessionId: SID, previous: null, dataSources: SOURCES })).rejects.toBeInstanceOf(
      AnalysisSetupError
    );
  });

  it("toAsciiUploadName: 한글과 공백을 지우고 남는 게 없으면 data<순번>", () => {
    expect(toAsciiUploadName("하냥센스_시험용_dataset.xlsx", "xlsx", 0)).toBe("dataset.xlsx");
    expect(toAsciiUploadName("my data (final).csv", "csv", 0)).toBe("my_data_final.csv");
    expect(toAsciiUploadName("고객데이터.xlsx", "xlsx", 1)).toBe("data2.xlsx");
    expect(toAsciiUploadName("../../etc/evil.csv", "csv", 0)).toBe("etc_evil.csv");
  });
});

describe("만료 복구 입력 구성", () => {
  const cell = (index: number, code: string, status = "completed", extra: Record<string, unknown> = {}) => ({
    index,
    status,
    code,
    logs: "",
    figures: [],
    ...extra,
  });
  const rec = (messageId: string, qIdx: number, turn: StoredAnalysisTurn): HistoryRecord => ({ messageId, qIdx, turn });
  const turnA = storedTurn({
    container_id: "cntr_old",
    cells: [cell(1, "df = load()"), cell(2, "boom()", "failed"), cell(3, "x" + "y".repeat(10), "completed", { code_truncated: true })],
  });
  const turnB = storedTurn({ container_id: "cntr_old", cells: [cell(1, "scaled = scale(df)")] });
  const other = storedTurn({ container_id: "cntr_older", cells: [cell(1, "OLD")] });

  it("이력은 그 컨테이너에서 성공한 원래 셀을 문항과 관계없이 시간 순서로 모은다(실패, 잘린 코드, 다른 컨테이너 제외)", () => {
    expect(
      collectContainerHistory([rec("m0", 0, other), rec("m1", 0, turnA), rec("m2", 1, turnB)], "cntr_old")
    ).toEqual([
      { qIdx: 0, code: "df = load()", ref: { m: "m1", i: 1 } },
      { qIdx: 1, code: "scaled = scale(df)", ref: { m: "m2", i: 1 } },
    ]);
  });

  it("길이 상한을 넘으면 앞에서부터 넣고 그 뒤 셀은 모두 빼고 센다", () => {
    expect(capCells([{ code: "a = 1" }, { code: "b".repeat(30) }, { code: "c = a" }], 25)).toEqual({
      cells: [{ code: "a = 1" }],
      omitted: 2,
    });
  });

  it("복원 셀을 하나로 합쳐 실행한 뒤 두 번째로 만료돼도 원래 셀로 다시 복원한다(잘린 합본에 이력이 묻히지 않음)", () => {
    // 리뷰 재현: 원래 셀 4개(읽기, 행 제외, 표준화, KMeans) → 첫 만료 → 새 컨테이너에서 복원 셀 하나(2만 자를 넘어 잘림)와
    // 새 셀 하나 → 두 번째 만료. 예전에는 잘린 합본이 빠지고 새 셀 하나만 남았다.
    const original = rec(
      "m1",
      0,
      storedTurn({
        container_id: "cntr_a",
        cells: [cell(1, "df = read()"), cell(2, "df = df[~mask]"), cell(3, "X = scale(df)"), cell(4, "km = KMeans(4).fit(X)")],
      })
    );
    const restored = rec(
      "m2",
      1,
      storedTurn({
        container_id: "cntr_b",
        cells: [
          cell(1, `exec(open("/mnt/data/abc-${REPLAY_FILE_NAME}").read())`, "completed", { replay: true }),
          cell(2, "merged" + "z".repeat(30), "completed", { code_truncated: true }),
          cell(3, "profile = df.groupby(km.labels_).mean()"),
        ],
        restore: { refs: [{ m: "m1", i: 1 }, { m: "m1", i: 2 }, { m: "m1", i: 3 }, { m: "m1", i: 4 }], mode: "file", status: "ok", ok_cells: 4, failed_cells: 0 },
      })
    );
    const history = collectContainerHistory([original, restored], "cntr_b");
    expect(history.map((h) => h.code)).toEqual([
      "df = read()",
      "df = df[~mask]",
      "X = scale(df)",
      "km = KMeans(4).fit(X)",
      "profile = df.groupby(km.labels_).mean()",
    ]);
    expect(history.map((h) => h.ref)).toEqual([
      { m: "m1", i: 1 },
      { m: "m1", i: 2 },
      { m: "m1", i: 3 },
      { m: "m1", i: 4 },
      { m: "m2", i: 3 },
    ]);
  });

  it("파일을 못 올려 모델이 코드를 다시 쓴 복원 턴(inline)은 이력에서 통째로 빼 같은 처리가 두 번 들어가지 않는다", () => {
    const original = rec("m1", 0, storedTurn({ container_id: "cntr_a", cells: [cell(1, "df = df[~mask]")] }));
    const inline = rec(
      "m2",
      0,
      storedTurn({
        container_id: "cntr_b",
        cells: [cell(1, "df = df[~mask]  # 다시 쓴 코드")],
        restore: { refs: [{ m: "m1", i: 1 }], mode: "inline", status: "ok" },
      })
    );
    const later = rec("m3", 0, storedTurn({ container_id: "cntr_b", cells: [cell(1, "X = scale(df)")] }));
    expect(collectContainerHistory([original, inline, later], "cntr_b").map((h) => h.code)).toEqual([
      "df = df[~mask]",
      "X = scale(df)",
    ]);
  });

  it("복원이 덜 끝난 컨테이너만 다시 복원한다(실패한 셀이 있는 partial 은 다시 해도 같으므로 하지 않는다)", () => {
    const at = (status: "ok" | "partial" | "incomplete") => [
      rec("m1", 0, storedTurn({ container_id: "cntr_b", restore: { refs: [], mode: "file", status } })),
    ];
    expect(restoreNeedsRetry(at("incomplete"), "cntr_b")).toBe(true);
    expect(restoreNeedsRetry(at("ok"), "cntr_b")).toBe(false);
    expect(restoreNeedsRetry(at("partial"), "cntr_b")).toBe(false);
    expect(restoreNeedsRetry(at("incomplete"), "cntr_other")).toBe(false);
    expect(restoreNeedsRetry([rec("m1", 0, storedTurn({ container_id: "cntr_b" }))], "cntr_b")).toBe(false);
  });

  it("옛 데이터 파일 경로는 여러 세대 전 것까지 지금 경로로 바꾼다", () => {
    const file = (path: string) => ({ name: "a.xlsx", path, file_id: path, source: "https://s/a.xlsx" });
    const records = [
      rec("m1", 0, storedTurn({ container_id: "a", files: [file("/mnt/data/gen1-a.xlsx")] })),
      rec("m2", 0, storedTurn({ container_id: "b", files: [file("/mnt/data/gen2-a.xlsx")] })),
    ];
    expect(historyPathRewrites(records, [file("/mnt/data/gen3-a.xlsx")])).toEqual([
      { from: "/mnt/data/gen1-a.xlsx", to: "/mnt/data/gen3-a.xlsx" },
      { from: "/mnt/data/gen2-a.xlsx", to: "/mnt/data/gen3-a.xlsx" },
    ]);
  });

  it("복원 파일은 ASCII 이고 셀 코드를 그대로(경로 치환 뒤) 담으며 결과 줄을 출력한다", () => {
    const script = buildReplayScript([
      { qIdx: 0, code: "df = pd.read_excel('/mnt/data/new-a.xlsx')\nprint(\"한글 '따옴표'\")" },
      { qIdx: 1, code: "X = scale(df)" },
    ]);
    expect(/^[\x00-\x7F]*$/.test(script)).toBe(true);
    const encoded = [...script.matchAll(/\("Q(\d)-C(\d)", "([A-Za-z0-9+/=]+)"\)/g)];
    expect(encoded.map((m) => `Q${m[1]}-C${m[2]}`)).toEqual(["Q1-C1", "Q2-C1"]);
    expect(Buffer.from(encoded[0][3], "base64").toString("utf8")).toBe(
      "df = pd.read_excel('/mnt/data/new-a.xlsx')\nprint(\"한글 '따옴표'\")"
    );
    // 다시 실행하는 동안의 출력과 그림은 내보내지 않고, 끝나면 plt.show 를 되돌린다.
    expect(script).toContain("redirect_stdout");
    expect(script).toContain("_qo_plt.show = _qo_show");
    expect(script).toContain(`print("${REPLAY_MARKER} ok=%d failed=%d"`);
  });

  it("복원 셀의 결과 줄을 읽는다. 없으면 null(복원이 끝까지 돌지 않음)", () => {
    expect(parseReplayResult(`${REPLAY_MARKER} ok=4 failed=0\n`)).toEqual({ ok: 4, failed: 0 });
    expect(parseReplayResult(`앞 출력\n${REPLAY_MARKER} ok=3 failed=1\n${REPLAY_MARKER}_ERROR Q1-C2 KeyError: 'x'`)).toEqual({ ok: 3, failed: 1 });
    expect(parseReplayResult("Traceback ... FileNotFoundError")).toBeNull();
    expect(isReplayCellCode(replayExecLine(`/mnt/data/abc-${REPLAY_FILE_NAME}`))).toBe(true);
    expect(isReplayCellCode("print(1)")).toBe(false);
  });

  it("파일 방식 복구 지시는 한 줄 실행을 시키고 코드는 참고로만 준다(문제 번호, 지금 문항, 넣지 못한 셀)", () => {
    const text = buildFileRestoreInstruction({
      path: `/mnt/data/abc-${REPLAY_FILE_NAME}`,
      reference: { cells: [{ qIdx: 0, code: "df = load()" }, { qIdx: 1, code: "km = fit(df)" }], omitted: 1 },
      omittedFromFile: 0,
      currentQIdx: 1,
    });
    expect(text.startsWith(REPLAY_INSTRUCTION_HEADER)).toBe(true);
    expect(text).toContain(`\`\`\`python\nexec(open("/mnt/data/abc-${REPLAY_FILE_NAME}").read())\n\`\`\``);
    expect(text).toContain("코드를 다시 쓰지 않고 이 한 줄만 실행합니다.");
    expect(text).toContain("지금 풀고 있는 문제는 문제 2입니다. 다른 번호가 붙은 셀은 앞 문항에서 실행한 코드입니다.");
    expect(text).toContain("# 문제 1 셀 1\ndf = load()\n\n# 문제 2 셀 1\nkm = fit(df)");
    expect(text).toContain("참고 코드에는 길이 제한으로 마지막 셀 1개를 넣지 않았습니다(파일에는 들어 있습니다).");
    expect(text).not.toContain("파일에도 넣지 못했습니다");
  });

  it("모델이 코드를 다시 실행하는 복구 지시(파일을 못 올렸을 때)에는 표시 문구와 문제 번호가 붙은 코드가 들어간다", () => {
    const text = buildReplayInstruction({
      cells: [
        { qIdx: 0, code: "df = load()" },
        { qIdx: 0, code: "scaled = scale(df)" },
      ],
      omitted: 1,
      currentQIdx: 0,
    });
    expect(text).toContain(REPLAY_INSTRUCTION_HEADER);
    expect(REPLAY_INSTRUCTION_HEADER).toBe("[이전 분석 코드(환경이 초기화되어 다시 실행 필요)]");
    expect(text).toContain("```python");
    expect(text).toContain("# 문제 1 셀 1\ndf = load()\n\n# 문제 1 셀 2\nscaled = scale(df)");
    expect(text).toContain("마지막 셀 1개");
    expect(text).not.toContain("지금 풀고 있는 문제는");
    expect(buildReplayInstruction({ cells: [], omitted: 0, currentQIdx: 0 })).toBeNull();
  });

  it("복구할 셀에 다른 문항의 셀이 섞여 있으면 지금 문항을 알리고, 셀마다 실행한 문항 번호를 붙인다", () => {
    const text = buildReplayInstruction({
      cells: [
        { qIdx: 0, code: "df = load()" },
        { qIdx: 1, code: "km = fit(df)" },
      ],
      omitted: 0,
      currentQIdx: 1,
    })!;
    expect(text).toContain("지금 풀고 있는 문제는 문제 2입니다. 다른 번호가 붙은 셀은 앞 문항에서 실행한 코드입니다.");
    expect(text).toContain("# 문제 1 셀 1\ndf = load()\n\n# 문제 2 셀 1\nkm = fit(df)");
    expect(text).not.toContain(LINKED_CODE_HEADER);
    expect(text).not.toContain("길이 제한");
  });

  it("복원 기록과 복원 셀 표시는 저장한 그대로 읽히고, 화면용 기록에는 복원 출처가 없다", () => {
    const turn = storedTurn({
      cells: [
        { index: 1, status: "completed", code: replayExecLine("/mnt/data/abc-x.py"), logs: "", figures: [], replay: true },
      ],
      cited_figures: [],
      restore: { refs: [{ m: "m1", i: 2 }], mode: "file", status: "partial", ok_cells: 3, failed_cells: 1 },
      interrupted_cells: 2,
    });
    expect(readStoredAnalysisTurn({ analysis: turn })).toEqual(turn);
    const client = toClientAnalysisTurn({ sessionId: SID, messageId: MID, turn });
    expect(client.cells[0].replay).toBe(true);
    expect(JSON.stringify(client)).not.toContain("refs");
    expect(JSON.stringify(client)).not.toContain("m1");
  });
});

describe("중단된 요청과 문항 간 연결의 입력 구성", () => {
  const cell = (index: number, code: string, status = "completed", extra: Record<string, unknown> = {}) => ({
    index,
    status,
    code,
    logs: "",
    figures: [],
    ...extra,
  });
  const live = { containerId: "cntr_live" };

  it("같은 문항의 중단된 턴(시간 상한)이 실행한 셀은 다음 턴에 interrupted 로 알린다(리뷰 차단 1 재현)", () => {
    const t1 = storedTurn({ container_id: "cntr_live", cells: [cell(1, "df = pd.read_excel(p)")], outcome: "completed" });
    const t2 = storedTurn({
      container_id: "cntr_live",
      cells: [cell(1, "mask = iqr(df)"), cell(2, "df = df[~mask]"), cell(3, "slow()", "incomplete")],
      outcome: "time_limit",
    });
    const unseen = collectUnseenCells(
      [
        { qIdx: 0, turn: t1 },
        { qIdx: 0, turn: t2 },
      ],
      { ...live, qIdx: 0 }
    );
    expect(unseen.interrupted).toEqual({
      cells: [
        { qIdx: 0, code: "mask = iqr(df)" },
        { qIdx: 0, code: "df = df[~mask]" },
      ],
      omitted: 0,
    });
    expect(unseen.linked).toEqual({ cells: [], omitted: 0 });
    // 그 뒤 같은 문항에서 성공한 턴이 있으면(그 턴이 이미 알렸으므로) 더는 알리지 않는다.
    const t3 = storedTurn({ container_id: "cntr_live", cells: [], outcome: "completed" });
    expect(
      collectUnseenCells(
        [
          { qIdx: 0, turn: t1 },
          { qIdx: 0, turn: t2 },
          { qIdx: 0, turn: t3 },
        ],
        { ...live, qIdx: 0 }
      ).interrupted.cells
    ).toEqual([]);
  });

  it("연결 끊김과 상류 오류로 중단된 턴도 같다. 복원 셀은 알리지 않는다", () => {
    const t1 = storedTurn({ container_id: "cntr_live", cells: [], outcome: "completed" });
    const cancelled = storedTurn({
      container_id: "cntr_live",
      cells: [cell(1, replayExecLine("/mnt/data/x.py"), "completed", { replay: true }), cell(2, "a = 1")],
      outcome: "client_cancelled",
    });
    const errored = storedTurn({ container_id: "cntr_live", cells: [cell(1, "b = 2")], outcome: "upstream_error" });
    expect(
      collectUnseenCells(
        [
          { qIdx: 2, turn: t1 },
          { qIdx: 2, turn: cancelled },
          { qIdx: 2, turn: errored },
        ],
        { ...live, qIdx: 2 }
      ).interrupted.cells.map((c) => c.code)
    ).toEqual(["a = 1", "b = 2"]);
  });

  it("연결 블록과 중단 블록은 시간 순서로 한 상한을 나눠 쓴다", () => {
    const other = storedTurn({ container_id: "cntr_live", cells: [cell(1, "x".repeat(20))], outcome: "completed" });
    const failedOwn = storedTurn({ container_id: "cntr_live", cells: [cell(1, "y".repeat(20))], outcome: "cell_limit" });
    const unseen = collectUnseenCells(
      [
        { qIdx: 0, turn: other },
        { qIdx: 1, turn: failedOwn },
      ],
      { ...live, qIdx: 1, maxChars: 30 }
    );
    expect(unseen.linked).toEqual({ cells: [{ qIdx: 0, code: "x".repeat(20) }], omitted: 0 });
    expect(unseen.interrupted).toEqual({ cells: [], omitted: 1 });
  });

  it("중단 지시는 정한 머리말, 지금 문항, 상태를 먼저 확인하라는 문장, 문제 번호가 붙은 코드를 담는다", () => {
    const text = buildInterruptedCodeInstruction({ cells: [{ qIdx: 0, code: "df = df[~mask]" }], omitted: 0, currentQIdx: 0 })!;
    expect(INTERRUPTED_CODE_HEADER).toBe("[직전 요청이 중단되기 전에 이미 실행된 코드 — 변수에 반영돼 있음]");
    expect(text.startsWith(`${INTERRUPTED_CODE_HEADER}\n지금 풀고 있는 문제는 문제 1입니다.`)).toBe(true);
    expect(text).toContain("같은 처리를 다시 하기 전에 지금 상태(행 수 등)를 먼저 확인합니다.");
    expect(text).toContain("```python\n# 문제 1 셀 1\ndf = df[~mask]\n```");
    expect(buildInterruptedCodeInstruction({ cells: [], omitted: 0, currentQIdx: 0 })).toBeNull();
  });

  it("문항 간 연결은 복원 셀을 빼고 원래 셀만 알린다", () => {
    const restoredQ1 = storedTurn({
      container_id: "cntr_live",
      cells: [cell(1, replayExecLine("/mnt/data/x.py"), "completed", { replay: true }), cell(2, "X = scale(df)")],
      outcome: "completed",
    });
    expect(collectLinkedCells([{ qIdx: 0, turn: restoredQ1 }], { ...live, qIdx: 1 }).cells).toEqual([
      { qIdx: 0, code: "X = scale(df)" },
    ]);
  });
});

describe("문항 간 연결 입력 구성", () => {
  const cell = (index: number, code: string, status = "completed", extra: Record<string, unknown> = {}) => ({
    index,
    status,
    code,
    logs: "",
    figures: [],
    ...extra,
  });
  const q1First = storedTurn({
    container_id: "cntr_live",
    cells: [
      cell(1, "df = pd.read_excel(p)"),
      cell(2, "boom()", "failed"),
      cell(3, "x" + "y".repeat(10), "completed", { code_truncated: true }),
      cell(4, "df_clean = df[mask]"),
    ],
    outcome: "completed",
  });
  const q1Second = storedTurn({
    container_id: "cntr_live",
    cells: [cell(1, "X = scale(df_clean)")],
    outcome: "completed",
  });
  const q2First = storedTurn({ container_id: "cntr_live", cells: [cell(1, "km = KMeans(4).fit(X)")], outcome: "completed" });
  const q1Again = storedTurn({ container_id: "cntr_live", cells: [cell(1, "df_clean = df[mask2]")], outcome: "completed" });
  const elsewhere = storedTurn({ container_id: "cntr_expired", cells: [cell(1, "OLD = 1")], outcome: "completed" });
  const live = { containerId: "cntr_live" };

  it("첫 문항의 첫 턴과 같은 문항에서 이어지는 턴은 알려 줄 코드가 없다(블록 없음)", () => {
    expect(collectLinkedCells([], { ...live, qIdx: 0 })).toEqual({ cells: [], omitted: 0 });
    expect(collectLinkedCells([{ qIdx: 0, turn: q1First }], { ...live, qIdx: 0 })).toEqual({ cells: [], omitted: 0 });
    expect(
      collectLinkedCells(
        [
          { qIdx: 0, turn: q1First },
          { qIdx: 1, turn: q2First },
        ],
        { ...live, qIdx: 1 }
      )
    ).toEqual({ cells: [], omitted: 0 });
    expect(buildLinkedCodeInstruction({ cells: [], omitted: 0, currentQIdx: 0 })).toBeNull();
  });

  it("새 문항의 첫 턴은 다른 문항이 지금 컨테이너에서 실행한 성공 셀을 시간 순서로 받는다(실패, 잘린 코드, 다른 컨테이너 제외)", () => {
    expect(
      collectLinkedCells(
        [
          { qIdx: 0, turn: elsewhere },
          { qIdx: 0, turn: q1First },
          { qIdx: 0, turn: q1Second },
        ],
        { ...live, qIdx: 1 }
      )
    ).toEqual({
      cells: [
        { qIdx: 0, code: "df = pd.read_excel(p)" },
        { qIdx: 0, code: "df_clean = df[mask]" },
        { qIdx: 0, code: "X = scale(df_clean)" },
      ],
      omitted: 0,
    });
  });

  it("다른 문항에 갔다가 돌아오면 이 문항의 마지막 성공 턴 뒤에 다른 문항이 실행한 셀만 받는다", () => {
    const records = [
      { qIdx: 0, turn: q1First },
      { qIdx: 1, turn: q2First },
      { qIdx: 0, turn: q1Again },
    ];
    expect(collectLinkedCells(records, { ...live, qIdx: 1 }).cells).toEqual([{ qIdx: 0, code: "df_clean = df[mask2]" }]);
    expect(collectLinkedCells(records.slice(0, 2), { ...live, qIdx: 0 }).cells).toEqual([
      { qIdx: 1, code: "km = KMeans(4).fit(X)" },
    ]);
  });

  it("이 문항의 실패한 턴은 대화에 이어지지 않으므로 본 것으로 치지 않는다", () => {
    const failedQ2 = storedTurn({ container_id: "cntr_live", cells: [cell(1, "km = slow()")], outcome: "cell_limit" });
    expect(
      collectLinkedCells(
        [
          { qIdx: 0, turn: q1First },
          { qIdx: 1, turn: failedQ2 },
        ],
        { ...live, qIdx: 1 }
      ).cells.map((c) => c.code)
    ).toEqual(["df = pd.read_excel(p)", "df_clean = df[mask]"]);
  });

  it("길이 상한(만료 복구와 같은 규칙)을 넘으면 앞에서부터 넣고 그 뒤 셀은 모두 빼고 센다", () => {
    expect(
      collectLinkedCells(
        [
          { qIdx: 0, turn: q1First },
          { qIdx: 0, turn: q1Second },
        ],
        { ...live, qIdx: 1, maxChars: 25 }
      )
    ).toEqual({ cells: [{ qIdx: 0, code: "df = pd.read_excel(p)" }], omitted: 2 });
  });

  it("상한에 걸린 셀 뒤의 셀은 짧아도 넣지 않는다(실행 순서가 끊긴 코드를 주지 않는다)", () => {
    const gap = storedTurn({
      container_id: "cntr_live",
      cells: [cell(1, "a = 1"), cell(2, "b = " + "9".repeat(30)), cell(3, "c = a")],
      outcome: "completed",
    });
    expect(collectLinkedCells([{ qIdx: 0, turn: gap }], { ...live, qIdx: 1, maxChars: 25 })).toEqual({
      cells: [{ qIdx: 0, code: "a = 1" }],
      omitted: 2,
    });
  });

  it("연결 지시는 정한 머리말, 지금 문항, 문제 번호가 붙은 코드를 담고 다시 실행하라고 하지 않는다", () => {
    const text = buildLinkedCodeInstruction({
      cells: [
        { qIdx: 0, code: "df_clean = df[mask]" },
        { qIdx: 0, code: "X = scale(df_clean)" },
        { qIdx: 2, code: "profile = df_clean.groupby(km.labels_).mean()" },
      ],
      omitted: 0,
      currentQIdx: 1,
    })!;
    expect(LINKED_CODE_HEADER).toBe("[앞 문항에서 실행한 분석 코드 — 변수는 분석 환경에 그대로 남아 있음]");
    expect(text.startsWith(`${LINKED_CODE_HEADER}\n지금 풀고 있는 문제는 문제 2입니다.`)).toBe(true);
    expect(text).toContain("다시 실행하지 않아도 됩니다");
    expect(text).toContain(
      "```python\n# 문제 1 셀 1\ndf_clean = df[mask]\n\n# 문제 1 셀 2\nX = scale(df_clean)\n\n# 문제 3 셀 1\nprofile = df_clean.groupby(km.labels_).mean()\n```"
    );
    expect(text).not.toContain(REPLAY_INSTRUCTION_HEADER);
    expect(text).not.toContain("길이 제한");
  });

  it("넣지 못한 셀이 있으면 그 수와 변수는 남아 있다는 것을 알린다", () => {
    const text = buildLinkedCodeInstruction({ cells: [{ qIdx: 0, code: "a = 1" }], omitted: 3, currentQIdx: 1 })!;
    expect(text).toContain("길이 제한으로 마지막 셀 3개의 코드는 넣지 못했습니다. 그 셀이 만든 변수도 남아 있으니");
  });

  it("buildStoredTurn 은 연결한 셀이 있을 때만 linked_cells 를 두고, 읽을 때도 그대로다", () => {
    const base = {
      containerId: "c",
      files: [],
      cells: [],
      citedFigures: [],
      outcome: "completed" as const,
      notices: [],
      replayedCells: 0,
      elapsedMs: 1,
    };
    expect(buildStoredTurn(base)).not.toHaveProperty("linked_cells");
    expect(buildStoredTurn({ ...base, linkedCells: 0 })).not.toHaveProperty("linked_cells");
    const linked = buildStoredTurn({ ...base, linkedCells: 3 });
    expect(linked.linked_cells).toBe(3);
    expect(readStoredAnalysisTurn({ analysis: linked })).toEqual(linked);
  });
});

describe("검토 반영: 자료 경로, 일부만 받은 파일, 경로 바뀜, 마감", () => {
  const SUPA = "https://proj.supabase.co";
  const base = `${SUPA}/storage/v1/object/public/exam-materials/`;

  it("교수 자료 키 모양만 받는다. 인코딩한 .. 로 다른 버킷을 가리키면 거절한다", () => {
    expect(materialObjectPath(`${base}instructor-abc/2026-10-03_1f2e.xlsx`, SUPA)).toBe("instructor-abc/2026-10-03_1f2e.xlsx");
    for (const bad of [
      `${base}x%2F..%2F..%2Fanalysis-outputs%2Fs%2Fm%2F1.png%3F.csv`,
      `${base}instructor-abc/..%2F..%2Fanalysis-outputs/s.png`,
      `${base}instructor-abc/sub/dir.xlsx`,
      `${base}instructor-abc/.hidden.xlsx`,
      `${base}other/2026.xlsx`,
      `${SUPA}/storage/v1/object/public/analysis-outputs/instructor-abc/a.xlsx`,
      `https://evil.example/storage/v1/object/public/exam-materials/instructor-abc/a.xlsx`,
      `${base}instructor-abc/a%ZZ.xlsx`,
    ]) {
      expect(materialObjectPath(bad, SUPA), bad).toBeNull();
    }
  });

  const twoSources = [
    { url: "https://s/exam-materials/a.xlsx", fileName: "a.xlsx", extension: "xlsx" as const },
    { url: "https://s/exam-materials/big.csv", fileName: "big.csv", extension: "csv" as const },
  ];

  it("다시 해도 못 받는 파일(용량 초과 등)은 본 공개 자료에 남겨, 다음 턴에 같은 자료면 컨테이너를 그대로 쓴다", async () => {
    const ops = fakeOps({
      downloadDataSource: vi.fn(async (s) =>
        s.url.endsWith("big.csv") ? { ok: false as const, permanent: true } : { ok: true as const, bytes: new Uint8Array([1]) }
      ),
    });
    const first = await ensureAnalysisContainer(ops, { sessionId: SID, previous: null, dataSources: twoSources });
    expect(first.files).toHaveLength(1);
    expect(first.sources).toEqual(twoSources.map((s) => s.url));

    const recorded = buildStoredTurn({
      containerId: first.containerId,
      files: first.files,
      sources: first.sources,
      cells: [],
      citedFigures: [],
      outcome: "completed",
      notices: [],
      replayedCells: 0,
      elapsedMs: 1,
    });
    const roundTrip = readStoredAnalysisTurn({ analysis: recorded });
    const ops2 = fakeOps();
    const second = await ensureAnalysisContainer(ops2, { sessionId: SID, previous: roundTrip, dataSources: twoSources });
    expect(second).toMatchObject({ containerId: first.containerId, restarted: false });
    expect(ops2.calls).toEqual([`get:${first.containerId}`]);
  });

  it("일시 오류로 못 받은 파일은 본 공개 자료에 넣지 않아, 다음 턴에 자료가 바뀐 것으로 보고 다시 받는다", async () => {
    const flaky = fakeOps({
      downloadDataSource: vi.fn(async (s) =>
        s.url.endsWith("big.csv") ? { ok: false as const, permanent: false } : { ok: true as const, bytes: new Uint8Array([1]) }
      ),
    });
    const first = await ensureAnalysisContainer(flaky, { sessionId: SID, previous: null, dataSources: twoSources });
    expect(first.sources).toEqual([twoSources[0].url]);
    const recorded = readStoredAnalysisTurn({
      analysis: buildStoredTurn({
        containerId: first.containerId,
        files: first.files,
        sources: first.sources,
        cells: [],
        citedFigures: [],
        outcome: "completed",
        notices: [],
        replayedCells: 0,
        elapsedMs: 1,
      }),
    });
    const healthy = fakeOps();
    const second = await ensureAnalysisContainer(healthy, { sessionId: SID, previous: recorded, dataSources: twoSources });
    expect(second.restarted).toBe(true);
    expect(healthy.calls.filter((c) => c.startsWith("upload:"))).toHaveLength(2);
    expect(second.sources.sort()).toEqual(twoSources.map((s) => s.url).sort());
  });

  it("파일을 다시 올려 경로가 바뀌면 옛 경로와 새 경로를 짝지어 돌려주고, 이전 코드의 경로를 바꿔 넣는다", async () => {
    const previous = storedTurn({
      container_id: "cntr_old",
      files: [{ name: "x.xlsx", path: "/mnt/data/file-gone-x.xlsx", file_id: "file-gone", source: SOURCES[0].url }],
    });
    const create = vi
      .fn()
      .mockRejectedValueOnce(new OpenAIHttpError({ message: "file not found", status: 404 }))
      .mockResolvedValueOnce({ id: "cntr_new", status: "running" });
    const ops = fakeOps({ createContainer: create, retrieveContainer: vi.fn(async () => ({ id: "x", status: "expired" })) });
    const ensured = await ensureAnalysisContainer(ops, { sessionId: SID, previous, dataSources: SOURCES });
    expect(ensured.pathRewrites).toEqual([{ from: "/mnt/data/file-gone-x.xlsx", to: "/mnt/data/file-up1-dataset.xlsx" }]);
    expect(applyPathRewrites("pd.read_excel('/mnt/data/file-gone-x.xlsx')", ensured.pathRewrites)).toBe(
      "pd.read_excel('/mnt/data/file-up1-dataset.xlsx')"
    );
  });

  it("공개 데이터 파일 내려받기가 응답하지 않으면 시간 제한 뒤 일시 실패로 끝낸다(다음 턴에 다시 받는다)", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPA);
      const supabase = { storage: { from: () => ({ download: () => new Promise(() => undefined) }) } } as never;
      const pending = downloadDataSource(supabase, {
        url: `${base}instructor-abc/2026-10-03_1f2e.xlsx`,
        fileName: "a.xlsx",
        extension: "xlsx",
      });
      await vi.advanceTimersByTimeAsync(DATA_SOURCE_DOWNLOAD_TIMEOUT_MS + 1);
      await expect(pending).resolves.toEqual({ ok: false, permanent: false });
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it("그림 저장은 마감이 지나면 올리지 않고, 남은 시간이 있으면 올린다", async () => {
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const supabase = { storage: { from: () => ({ upload }) } } as never;
    const errors: string[] = [];
    const late = createFigureStore(supabase, (p) => errors.push(p), () => 0);
    expect(await late.upload("s/m/1.png", new Uint8Array([1]), "image/png")).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(errors).toEqual(["s/m/1.png"]);
    const inTime = createFigureStore(supabase, undefined, () => 60_000);
    expect(await inTime.upload("s/m/1.png", new Uint8Array([1]), "image/png")).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
