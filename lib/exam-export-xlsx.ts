import ExcelJS from "exceljs";
import {
  averageInt,
  examScoreHeader,
  examScoreRow,
  type ExamResultData,
} from "./exam-export";
import type { ScoreWeights } from "./grade-utils";

// 색상 최소화: 헤더 음영 1종 + 옅은 테두리 + 회색 보조텍스트 (점수 색상밴드 없음)
const HEADER_FILL = "FFF3F4F6";
const BORDER_COLOR = "FFD1D5DB";
const MUTED_TEXT = "FF6B7280";

function weightsDisplay(weights: ScoreWeights | null) {
  if (!weights?.typeWeights) return "문항 균등";
  const order: Array<["multiple-choice" | "true-false" | "case", string]> = [
    ["multiple-choice", "객관식"],
    ["true-false", "OX"],
    ["case", "서술형"],
  ];
  const parts = order
    .filter(([bucket]) => typeof weights.typeWeights[bucket] === "number")
    .map(([bucket, label]) => `${label} ${weights.typeWeights[bucket]}%`);
  return parts.length ? parts.join(" / ") : "문항 균등";
}

function thinBorder(): ExcelJS.Borders {
  const side = { style: "thin" as const, color: { argb: BORDER_COLOR } };
  return { top: side, left: side, bottom: side, right: side } as ExcelJS.Borders;
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
}

/** 직사각형 블록(r1..r2, c1..c2)에 옅은 테두리를 둘러 "반듯한 표"로 만든다. */
function applyBlockBorder(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      ws.getCell(r, c).border = thinBorder();
    }
  }
}

/**
 * 단일 시트 시험 결과 워크북: 시험정보(상단) → 점수표 → 점수분포.
 * 색상 최소화·직사각형 블록. 객관식은 "N번(정답/오답)"·OX는 "O/X(정답/오답)".
 */
export function buildExamResultWorkbook(
  meta: { title: string; code: string },
  data: ExamResultData
): ExcelJS.Workbook {
  const {
    orderedQuestions,
    scoreWeights,
    students,
    finalScores,
    gradedCount,
    questionStats,
  } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Quest-On";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("시험 결과");
  const totalCols = orderedQuestions.length + 5;
  sheet.columns = [
    { width: 16 }, // 이름
    { width: 14 }, // 학번
    { width: 14 }, // 제출 시각
    { width: 8 }, // 지각
    ...orderedQuestions.map(() => ({ width: 12 })), // 문항
    { width: 12 }, // 최종 점수
  ];

  // ── 상단: 시험 정보 (압축 3줄) ──
  const titleRow = sheet.addRow([`${meta.title} 시험 결과`]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, totalCols);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: "middle" };
  titleRow.height = 22;

  const info1 =
    `시험 코드 ${meta.code}  ·  문항 ${orderedQuestions.length}개  ·  ` +
    `응시 ${students.length}명 / 채점 ${gradedCount}명` +
    (gradedCount
      ? `  ·  평균 ${averageInt(finalScores)}점 (최고 ${Math.max(
          ...finalScores
        )} / 최저 ${Math.min(...finalScores)})`
      : "");
  const infoRow1 = sheet.addRow([info1]);
  sheet.mergeCells(infoRow1.number, 1, infoRow1.number, totalCols);
  infoRow1.getCell(1).font = { color: { argb: MUTED_TEXT }, size: 10 };

  const info2 =
    `점수 비중 ${weightsDisplay(scoreWeights)}  ·  내보낸 날짜 ` +
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  const infoRow2 = sheet.addRow([info2]);
  sheet.mergeCells(infoRow2.number, 1, infoRow2.number, totalCols);
  infoRow2.getCell(1).font = { color: { argb: MUTED_TEXT }, size: 10 };

  sheet.addRow([]); // 빈 행

  // ── 점수표 ──
  const headerRow = sheet.addRow(examScoreHeader(orderedQuestions));
  const scoreHeaderNum = headerRow.number;
  headerRow.eachCell((cell, col) => {
    styleHeaderCell(cell);
    if (col >= 3) cell.alignment = { horizontal: "center" };
  });

  students.forEach((student) => {
    const row = sheet.addRow(examScoreRow(student, orderedQuestions));
    row.eachCell((cell, col) => {
      if (col >= 3) cell.alignment = { horizontal: "center" };
    });
    row.getCell(totalCols).font = { bold: true };
  });

  const aggRow = sheet.addRow([
    "문항 평균",
    "",
    "",
    "",
    ...questionStats,
    gradedCount ? averageInt(finalScores) : "-",
  ]);
  aggRow.eachCell((cell, col) => {
    cell.font = { bold: true };
    if (col >= 3) cell.alignment = { horizontal: "center" };
  });
  applyBlockBorder(sheet, scoreHeaderNum, 1, aggRow.number, totalCols);

  sheet.addRow([]);
  sheet.addRow([]); // 점수표와 분석 사이 2칸 (autoFilter 간섭 방지)

  // ── 점수 분포 ──
  const dTitleRow = sheet.addRow(["최종 점수 분포"]);
  dTitleRow.getCell(1).font = { bold: true };
  const dHeadRow = sheet.addRow(["구간", "인원", "비율"]);
  dHeadRow.eachCell((cell) => styleHeaderCell(cell));
  const dBodyStart = dHeadRow.number;
  const ranges = [
    { label: "90점 이상", min: 90, max: Infinity },
    { label: "80-89점", min: 80, max: 89 },
    { label: "70-79점", min: 70, max: 79 },
    { label: "60-69점", min: 60, max: 69 },
    { label: "60점 미만", min: -Infinity, max: 59 },
  ];
  ranges.forEach((range) => {
    const count = finalScores.filter(
      (score) => score >= range.min && score <= range.max
    ).length;
    const row = sheet.addRow([
      range.label,
      count,
      gradedCount ? count / gradedCount : 0,
    ]);
    row.getCell(3).numFmt = "0%";
  });
  applyBlockBorder(sheet, dBodyStart, 1, sheet.rowCount, 3);

  sheet.views = [{ state: "frozen", ySplit: scoreHeaderNum }];
  sheet.autoFilter = {
    from: { row: scoreHeaderNum, column: 1 },
    to: { row: scoreHeaderNum, column: totalCols },
  };

  return workbook;
}
