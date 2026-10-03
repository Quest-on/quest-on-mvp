/**
 * 분석 턴 최종 답변 텍스트 정리 (이슈 #545)
 *
 * 모델은 그림이나 파일을 저장하면 답변에 `sandbox:/mnt/data/...` 링크를 넣고, 파일 인용
 * (container_file_citation)을 단다(스파이크 T4). 컨테이너 파일은 컨테이너가 만료되면 내려받을 수 없고 학생 화면에서
 * 그대로 두면 깨진 링크다. 그래서
 *   - 그림 마크다운 `![설명](sandbox:...)` 은 지운다. 그림은 셀 블록에 저장된 그림으로 보인다.
 *   - 링크 마크다운 `[이름](sandbox:...)` 은 이름만 남긴다.
 *   - 맨 `sandbox:/mnt/data/파일` 은 파일 이름만 남긴다.
 * 파일 인용의 그림은 호출부가 내려받아 저장한다(`collectFileCitations`).
 *
 * 이 모듈은 순수하다.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 링크 대상(sandbox 경로). 파일 이름에 괄호 한 겹이 들어갈 수 있다(`clusters (1).csv`). 첫 `)` 에서 멈추면 링크가
 * 중간에 잘려 `파일.csv)` 같은 찌꺼기가 남는다.
 */
const SANDBOX_IMAGE_RE = /!\[[^\]\n]*\]\(\s*<?sandbox:(?:[^()\n]|\([^()\n]*\))*>?\s*\)/g;
const SANDBOX_LINK_RE = /\[([^\]\n]*)\]\(\s*<?sandbox:(?:[^()\n]|\([^()\n]*\))*>?\s*\)/g;

/** 답변에서 sandbox 링크를 지우거나 이름만 남긴다. */
export function stripSandboxLinks(text: string): string {
  let out = text;
  // 그림: ![alt](sandbox:...) 와 ![alt](<sandbox:...>)
  out = out.replace(SANDBOX_IMAGE_RE, "");
  // 링크: [label](sandbox:...) → label
  out = out.replace(SANDBOX_LINK_RE, (_m, label: string) => label);
  // 맨 경로: sandbox:/mnt/data/dir/name.ext → name.ext
  out = out.replace(/sandbox:(?:\/[^\s)\]]*\/)?([^\s/)\]]+)/g, (_m, name: string) => name);
  // 지운 자리에 남은 빈 줄을 정리한다(세 줄 이상 빈 줄을 두 줄로).
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export type FileCitation = {
  containerId: string;
  fileId: string;
  filename: string;
};

const IMAGE_FILE_RE = /\.(png|jpe?g)$/i;

/**
 * 최종 응답의 output 에서 파일 인용 중 그림만 모은다(같은 파일은 한 번). 그림이 아닌 파일(csv 등)은 버린다 —
 * 링크는 `stripSandboxLinks` 가 이름만 남긴다.
 */
export function collectImageCitations(output: unknown): FileCitation[] {
  if (!Array.isArray(output)) return [];
  const seen = new Set<string>();
  const citations: FileCitation[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!isRecord(part) || part.type !== "output_text" || !Array.isArray(part.annotations)) continue;
      for (const annotation of part.annotations) {
        if (!isRecord(annotation) || annotation.type !== "container_file_citation") continue;
        const { container_id, file_id, filename } = annotation;
        if (typeof container_id !== "string" || typeof file_id !== "string") continue;
        const name = typeof filename === "string" ? filename : "";
        if (!IMAGE_FILE_RE.test(name)) continue;
        if (seen.has(file_id)) continue;
        seen.add(file_id);
        citations.push({ containerId: container_id, fileId: file_id, filename: name });
      }
    }
  }
  return citations;
}

/**
 * 최종 응답의 output 에서 답변 텍스트를 모은다. 도구 호출 앞뒤로 message 항목이 여러 개 올 수 있어(스파이크 T4)
 * 모든 message 의 output_text 를 순서대로 빈 줄로 잇는다. (기존 `extractResponseText` 는 첫 message 만 읽는다.)
 */
export function collectOutputText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    const text = item.content
      .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === "output_text")
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join("\n\n");
}
