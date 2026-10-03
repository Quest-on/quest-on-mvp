/**
 * 분석 실행이 켜지는 조건 (이슈 #545)
 *
 * 일반 규칙이다. 특정 교수나 시험을 이름으로 가리키지 않는다.
 *   1. 그 문항의 AI 역할이 분석 파트너다(`resolveExamAiProfile`, 문항 `ai_role`, 한국어 시험).
 *   2. 시험에 학생에게 공개된 데이터 파일(xlsx, xls, csv)이 하나 이상 있다. 공개 여부는 에픽 A 의 계약
 *      `getStudentVisibleMaterials(exam)`(`lib/student-materials.ts`, 컬럼 `exams.student_materials`)이 정한다.
 * 둘 중 하나라도 아니면 기존 `/api/chat` 경로(사례형, 도구 없는 분석 파트너)로 답한다.
 *
 * 판정(`decideAnalysisExecution`)은 순수 함수이고, 공개 자료 목록을 읽는 일(`listStudentVisibleMaterials`)만
 * 에픽 A 헬퍼를 부른다. 헬퍼가 던지면(컬럼이 아직 없는 DB 등) 공개 자료가 없는 것으로 본다 — 학생 채팅을 막지
 * 않고 도구 없는 경로로 떨어진다.
 */

import type { ResolvedExamAiProfile } from "@/lib/exam-ai-profile";
import { getStudentVisibleMaterials } from "@/lib/student-materials";

export const ANALYSIS_DATA_EXTENSIONS = ["xlsx", "xls", "csv"] as const;
export type AnalysisDataExtension = (typeof ANALYSIS_DATA_EXTENSIONS)[number];

export type VisibleMaterial = { url: string; fileName: string; extension: string };

export type AnalysisDataSource = {
  url: string;
  fileName: string;
  extension: AnalysisDataExtension;
};

export type AnalysisExecutionDecision =
  | { enabled: true; dataSources: AnalysisDataSource[] }
  | { enabled: false; reason: "not_analysis_partner" | "no_data_files" };

/** 확장자를 정규화한다: 앞의 점을 떼고 소문자. 비어 있으면 파일 이름이나 URL 끝에서 읽는다. */
export function normalizeDataExtension(material: VisibleMaterial): AnalysisDataExtension | null {
  const candidates = [material.extension, material.fileName, material.url.split(/[?#]/)[0]];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const raw = candidate.includes(".") ? candidate.slice(candidate.lastIndexOf(".") + 1) : candidate;
    const ext = raw.trim().toLowerCase();
    if ((ANALYSIS_DATA_EXTENSIONS as readonly string[]).includes(ext)) return ext as AnalysisDataExtension;
    if (candidate === material.extension && ext) return null; // 확장자를 명시했는데 데이터 형식이 아니다.
  }
  return null;
}

/** 공개 자료 가운데 데이터 파일만 고른다(같은 URL 은 한 번). 순서는 공개 자료 순서다. */
export function selectDataSources(materials: ReadonlyArray<VisibleMaterial>): AnalysisDataSource[] {
  const seen = new Set<string>();
  const sources: AnalysisDataSource[] = [];
  for (const material of materials) {
    if (!material || typeof material.url !== "string" || !material.url) continue;
    if (seen.has(material.url)) continue;
    const extension = normalizeDataExtension(material);
    if (!extension) continue;
    seen.add(material.url);
    sources.push({ url: material.url, fileName: material.fileName || `data.${extension}`, extension });
  }
  return sources;
}

/**
 * 업로드 URL 의 마지막 조각은 `날짜_uuid.확장자` 라 원래 파일 이름이 없다(에픽 A 의 `fileName` 도 그 값이다).
 * 자료 텍스트 추출 기록(`exams.materials_text` 의 `{ url, fileName }`)에 원래 이름이 있으면 그 이름으로 바꾼다.
 * 지시문의 데이터 파일 목록에서 학생이 말하는 파일 이름과 맞추려는 것이다. 없으면 그대로 둔다.
 */
export function withOriginalFileNames(
  materials: ReadonlyArray<VisibleMaterial>,
  materialsText: unknown
): VisibleMaterial[] {
  const names = new Map<string, string>();
  if (Array.isArray(materialsText)) {
    for (const entry of materialsText) {
      if (!entry || typeof entry !== "object") continue;
      const { url, fileName } = entry as { url?: unknown; fileName?: unknown };
      if (typeof url === "string" && typeof fileName === "string" && fileName.trim()) names.set(url, fileName.trim());
    }
  }
  return materials.map((m) => {
    const original = names.get(m.url);
    return original ? { ...m, fileName: original } : { ...m };
  });
}

/** 켜지는 조건. 순수 함수다. */
export function decideAnalysisExecution(params: {
  profile: ResolvedExamAiProfile;
  visibleMaterials: ReadonlyArray<VisibleMaterial>;
}): AnalysisExecutionDecision {
  if (params.profile.role !== "analysis_partner") return { enabled: false, reason: "not_analysis_partner" };
  const dataSources = selectDataSources(params.visibleMaterials);
  if (dataSources.length === 0) return { enabled: false, reason: "no_data_files" };
  return { enabled: true, dataSources };
}

type StudentMaterialsExam = Parameters<typeof getStudentVisibleMaterials>[0];

/** 에픽 A 헬퍼로 학생 공개 자료를 읽는다. 던지면 빈 목록이다(호출부가 로그를 남긴다). */
export function listStudentVisibleMaterials(exam: Record<string, unknown>): {
  materials: VisibleMaterial[];
  error: unknown;
} {
  try {
    const result = getStudentVisibleMaterials(exam as StudentMaterialsExam);
    return { materials: Array.isArray(result) ? (result as VisibleMaterial[]) : [], error: null };
  } catch (error) {
    return { materials: [], error };
  }
}
