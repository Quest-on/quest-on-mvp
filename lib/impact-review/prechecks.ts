import type {
  DiffFile,
  DeterministicFinding,
  MirrorRule,
  PatternRule,
  Rule,
  RuleCatalog,
} from "./types";

/**
 * 모델 호출 *전*에 실행되는 결정적 prechecks.
 * 여기서 만든 finding은 최종(non-vetoable) — 모델이 제거/강등할 수 없다.
 *
 * 거울(mirror) 규칙 판정:
 *  - mirror 한쪽 파일만 변경 + watch 패턴 hit → Critical 후보.
 *  - 면제: hit한 watch가 *모두* "같은 차원 공용 헬퍼 hunk"로 커버될 때만.
 *    무관한 공용모듈 hunk(같은 커밋이라도)는 면제하지 못한다.
 */
export function runPrechecks(files: DiffFile[], catalog: RuleCatalog): DeterministicFinding[] {
  const findings: DeterministicFinding[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  for (const rule of catalog.rules) {
    if (rule.kind === "mirror") {
      const f = checkMirror(rule, byPath);
      if (f) findings.push(f);
    } else {
      findings.push(...checkPattern(rule, files));
    }
  }
  return findings;
}

function checkMirror(
  rule: MirrorRule,
  byPath: Map<string, DiffFile>
): DeterministicFinding | null {
  const create = byPath.get(rule.sides.create);
  const edit = byPath.get(rule.sides.edit);
  const createChanged = !!create;
  const editChanged = !!edit;

  // 양쪽 다 변경 or 둘 다 미변경 → 거울 위반 아님.
  if (createChanged === editChanged) return null;

  const changedSide = (create ?? edit)!;
  const changedSidePath = createChanged ? rule.sides.create : rule.sides.edit;
  const hunkText = changedSide.changedText;

  // watch hit 수집.
  const hits = rule.watch.filter((w) => hunkText.includes(w));
  if (hits.length === 0) return null;

  // 각 hit이 "만족된 same-dimension 면제"로 커버되는지.
  const exemptions = rule.exemptions ?? [];
  const satisfied = exemptions.filter((ex) => {
    const helper = byPath.get(ex.helper);
    if (!helper) return false; // 헬퍼 파일 자체가 변경 안 됨 → 면제 불가.
    if (!helperHunkCovers(ex.helperHunk, helper.changedText)) return false;
    // 이 면제가 커버하는 차원이 실제로 변경 측에서 건드려졌는지.
    const dimensionTouched = ex.mirrorWatch.some((p) => hunkText.includes(p));
    return dimensionTouched;
  });

  const coveredWatch = new Set<string>();
  for (const ex of satisfied) for (const w of ex.mirrorWatch) coveredWatch.add(w);

  const uncovered = hits.filter((h) => !coveredWatch.has(h));
  if (uncovered.length === 0) return null; // 모든 hit이 same-dimension 헬퍼로 커버 → 면제.

  const missingSide = createChanged ? "edit" : "create";
  const missingPath = createChanged ? rule.sides.edit : rule.sides.create;
  return {
    source: "deterministic",
    severity: rule.severity,
    confidence: 100,
    ruleIds: [rule.id],
    message:
      `거울 쌍 한쪽만 변경됨 — '${changedSidePath}'은 바뀌었지만 짝 '${missingPath}'(${missingSide})은 미변경. ` +
      `미커버 변경 신호: ${uncovered.join(", ")}. ` +
      `같은 차원의 공용 헬퍼 hunk로 커버되지 않으므로 양쪽을 동기화하거나 공용 모듈로 추출하세요.`,
    location: { path: changedSidePath },
  };
}

/**
 * same-dimension 헬퍼 hunk가 그 차원을 실제로 커버하는지(오면제 방지).
 * - "강한" 토큰(함수명류: camelCase 길이>=12) 1개 매치 → 커버.
 * - 그 외 broad 토큰(`options`, `trim()` 등)은 2개 이상 함께 매치돼야 커버.
 * 같은 헬퍼 파일이라도 무관한 hunk가 broad 토큰 하나로 오면제하지 못하게 한다.
 */
function helperHunkCovers(helperHunk: string[], helperChangedText: string): boolean {
  const matched = helperHunk.filter((p) => helperChangedText.includes(p));
  if (matched.length === 0) return false;
  const strong = matched.some((t) => /[a-z][A-Z]/.test(t) && t.length >= 12);
  return strong || matched.length >= 2;
}

function checkPattern(rule: PatternRule, files: DiffFile[]): DeterministicFinding[] {
  const out: DeterministicFinding[] = [];
  const prefixes = rule.anyPath.length ? rule.anyPath : [""];
  const regexes = rule.signals.map((s) => safeRegex(s));
  for (const f of files) {
    if (!prefixes.some((p) => f.path.startsWith(p))) continue;
    const hit = regexes.some((re) => re.test(f.changedText));
    if (hit) {
      out.push({
        source: "deterministic",
        severity: rule.severity,
        confidence: 100,
        ruleIds: [rule.id],
        message: rule.message,
        location: { path: f.path },
      });
    }
  }
  return out;
}

function safeRegex(src: string): RegExp {
  try {
    return new RegExp(src);
  } catch {
    // 정규식이 깨지면 리터럴로 escape 후 매칭.
    return new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
}

export function _isRule(x: unknown): x is Rule {
  return !!x && typeof x === "object" && "kind" in (x as object);
}
