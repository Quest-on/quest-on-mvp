/**
 * 분석 실행 단위 모듈 (이슈 #545): 셀 수집과 상한, 오류 분류, 답변 텍스트 정리, 저장 기록 모양, 켜지는 조건,
 * 컨테이너 준비와 만료 복구 입력.
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
  buildReplayInstruction,
  collectReplayCells,
  ensureAnalysisContainer,
  toAsciiUploadName,
  type ContainerOps,
} from "@/lib/analysis-exec/container";
import { buildStoredTurn, storeCellFigures, storeCitedFigures } from "@/lib/analysis-exec/persist";
import { resolveExamAiProfile } from "@/lib/exam-ai-profile";

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

  it("원래 파일 이름은 텍스트 추출 기록에서 가져오고, 없으면 그대로 둔다", () => {
    const visible = [
      { url: "https://s/1.xlsx", fileName: "2026-10-03_aaa.xlsx", extension: "xlsx" },
      { url: "https://s/2.csv", fileName: "2026-10-03_bbb.csv", extension: "csv" },
    ];
    expect(
      withOriginalFileNames(visible, [{ url: "https://s/1.xlsx", fileName: "고객 데이터.xlsx" }, { url: "https://s/2.csv", fileName: " " }])
    ).toEqual([
      { url: "https://s/1.xlsx", fileName: "고객 데이터.xlsx", extension: "xlsx" },
      { url: "https://s/2.csv", fileName: "2026-10-03_bbb.csv", extension: "csv" },
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
    downloadDataSource: vi.fn(async () => new Uint8Array([1, 2, 3])),
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
    const ops = fakeOps({ downloadDataSource: vi.fn(async () => null) });
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
  const turnA = storedTurn({
    container_id: "cntr_old",
    cells: [
      { index: 1, status: "completed", code: "df = load()", logs: "", figures: [] },
      { index: 2, status: "failed", code: "boom()", logs: "", figures: [] },
      { index: 3, status: "completed", code: "x" + "y".repeat(10), logs: "", figures: [], code_truncated: true },
    ],
  });
  const turnB = storedTurn({
    container_id: "cntr_old",
    cells: [{ index: 1, status: "completed", code: "scaled = scale(df)", logs: "", figures: [] }],
  });
  const other = storedTurn({
    container_id: "cntr_older",
    cells: [{ index: 1, status: "completed", code: "OLD", logs: "", figures: [] }],
  });

  it("만료된 컨테이너에서 성공한 셀만 시간 순서로 모은다(실패, 잘린 코드, 다른 컨테이너 제외)", () => {
    expect(collectReplayCells([other, turnA, turnB], "cntr_old")).toEqual({
      codes: ["df = load()", "scaled = scale(df)"],
      omitted: 0,
    });
  });

  it("길이 상한을 넘으면 앞에서부터 넣고 나머지 수를 센다", () => {
    expect(collectReplayCells([turnA, turnB], "cntr_old", 12)).toEqual({ codes: ["df = load()"], omitted: 1 });
  });

  it("복구 지시에는 표시 문구와 코드가 들어가고, 다시 실행할 코드가 없으면 null", () => {
    const text = buildReplayInstruction({ codes: ["df = load()", "scaled = scale(df)"], omitted: 1 });
    expect(text).toContain("[이전 분석 코드(환경이 초기화되어 다시 실행 필요)]");
    expect(text).toContain("```python");
    expect(text).toContain("# 이전 셀 2\nscaled = scale(df)");
    expect(text).toContain("마지막 셀 1개");
    expect(buildReplayInstruction({ codes: [], omitted: 0 })).toBeNull();
  });
});
