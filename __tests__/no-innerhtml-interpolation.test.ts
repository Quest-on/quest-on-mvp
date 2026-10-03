/**
 * `innerHTML` 에 값을 끼워 넣는 코드가 다시 들어오지 않게 막는 소스 검사(#528).
 *
 * 교수자 홈의 드래그 미리보기가 폴더 이름(사용자 입력)을 템플릿 문자열로 `innerHTML` 에
 * 넣고 있었다. 이름에 `<img src=x onerror=...` 가 들어가면 그대로 실행될 수 있다.
 * 사용자 값은 `textContent` 나 DOM 노드로 넣고, `innerHTML` 에는 고정 문자열만 쓴다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** `x.innerHTML = <식>;` 의 식 부분을 세미콜론까지 모은다(여러 줄 템플릿 포함). */
function innerHtmlAssignments(source: string): string[] {
  const found: string[] = [];
  const re = /\.innerHTML\s*=(?!=)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const start = m.index + m[0].length;
    const end = source.indexOf(";", start);
    found.push(source.slice(start, end === -1 ? undefined : end));
  }
  return found;
}

describe("innerHTML 에 값을 끼워 넣지 않는다 (#528)", () => {
  const files = SCAN_DIRS.flatMap((d) => listSourceFiles(join(ROOT, d)));

  it("검사 대상 파일이 있다", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("innerHTML 대입식에 템플릿 보간(${...})이나 문자열 덧셈이 없다", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const expr of innerHtmlAssignments(source)) {
        if (/\$\{/.test(expr) || /["'`]\s*\+|\+\s*["'`]/.test(expr)) {
          offenders.push(`${relative(ROOT, file)}: innerHTML =${expr.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("교수자 홈 드래그 미리보기는 이름을 textContent 로 넣는다", () => {
    const source = readFileSync(join(ROOT, "components/instructor/InstructorHomeClient.tsx"), "utf8");
    expect(source).toMatch(/\.textContent\s*=\s*node\.name/);
    expect(source).not.toMatch(/innerHTML\s*=[^;]*node\.name/);
  });
});
