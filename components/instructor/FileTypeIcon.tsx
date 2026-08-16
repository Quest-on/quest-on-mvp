import {
  ClipboardList,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";

/**
 * 파일 확장자 아이콘.
 *
 * 시험 생성(`instructor/new`)과 편집(`instructor/[examId]/edit`) 두 화면이
 * 같은 구현을 각자 들고 있었다. 그러다 #228 이 편집 쪽만 잘못 건드려
 * 같은 PDF 가 화면마다 다른 색이 됐다. 한 곳으로 모아 구조적으로 막는다.
 *
 * **색은 상태가 아니라 파일 종류를 뜻한다.** PDF=빨강, PPT=주황, DOC=파랑,
 * XLS=초록, HWP=하늘, 이미지=보라. 흔히 쓰는 관례색이라 시맨틱 토큰
 * (`destructive`/`warning`/`info` …)으로 바꾸면 안 된다 — PDF 가 "오류"로,
 * XLS 가 "성공"으로 읽힌다.
 *
 * 알 수 없는 확장자만 `muted-foreground` 토큰을 쓴다. 그건 "종류 없음"이라는
 * 중립 상태라 토큰이 맞다.
 */

type IconSpec = { Icon: LucideIcon; className: string };

const UNKNOWN: IconSpec = { Icon: File, className: "text-muted-foreground" };

/** 확장자 → 아이콘·색. 여기가 이 팔레트의 유일한 정의다. */
const BY_EXTENSION: Record<string, IconSpec> = {
  pdf: { Icon: FileText, className: "text-red-500" },

  ppt: { Icon: Presentation, className: "text-orange-500" },
  pptx: { Icon: Presentation, className: "text-orange-500" },

  doc: { Icon: FileText, className: "text-blue-500" },
  docx: { Icon: FileText, className: "text-blue-500" },

  xls: { Icon: FileSpreadsheet, className: "text-green-500" },
  xlsx: { Icon: FileSpreadsheet, className: "text-green-500" },
  csv: { Icon: FileSpreadsheet, className: "text-green-500" },

  hwp: { Icon: ClipboardList, className: "text-sky-500" },
  hwpx: { Icon: ClipboardList, className: "text-sky-500" },

  jpg: { Icon: FileImage, className: "text-purple-500" },
  jpeg: { Icon: FileImage, className: "text-purple-500" },
  png: { Icon: FileImage, className: "text-purple-500" },
  gif: { Icon: FileImage, className: "text-purple-500" },
  webp: { Icon: FileImage, className: "text-purple-500" },
};

/** 테스트와 가드가 참조하는 확장자 목록. */
export const FILE_ICON_EXTENSIONS = Object.keys(BY_EXTENSION);

export function fileIconSpec(fileName: string): IconSpec {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return (ext && BY_EXTENSION[ext]) || UNKNOWN;
}

export function FileTypeIcon({
  fileName,
  className = "w-4 h-4 shrink-0",
}: {
  fileName: string;
  /** 크기·여백. 색은 확장자가 정하므로 여기서 덮지 않는다. */
  className?: string;
}) {
  const { Icon, className: colorClass } = fileIconSpec(fileName);
  return <Icon className={`${className} ${colorClass}`} />;
}
