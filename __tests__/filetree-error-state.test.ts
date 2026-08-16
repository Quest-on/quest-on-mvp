import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 파일 트리 두 곳도 오류와 빈 상태를 구분해야 한다. (#241)
 *
 * `SidebarFolderTree`(#240) 와 같은 결함이었다. `useQuery` 에서 `isLoading`
 * 만 꺼내 쓰면 조회 실패가 "폴더 없음" 또는 빈 트리로 렌더된다. 폴더로
 * 시험을 관리하는 교수자에게는 자료 유실로 읽힌다.
 *
 * 각 파일에 `useQuery` 가 둘씩 있다. 한쪽만 고치면 나머지가 계속 거짓말한다.
 */
const FILES = [
  "components/dashboard/FileTree.tsx",
  "components/instructor/InstructorHomeClient.tsx",
] as const;

describe.each(FILES)("%s — 오류 상태", (file) => {
  const SOURCE = readFileSync(resolve(process.cwd(), file), "utf8");

  it("폴더 내용 쿼리가 모두 isError 와 refetch 를 꺼낸다", () => {
    const destructures = [
      ...SOURCE.matchAll(/const\s*\{[^}]*\}\s*=\s*useQuery\(/g),
    ];
    const folderQueries = destructures.filter((m) =>
      /data:\s*(children|rootNodes)\s*=\s*\[\]/.test(m[0])
    );
    expect(folderQueries.length, "폴더 쿼리를 못 찾았다").toBeGreaterThan(0);

    for (const q of folderQueries) {
      expect(q[0], "isError 가 빠진 폴더 쿼리가 있다").toMatch(/\bisError\b/);
      expect(q[0], "refetch 가 빠진 폴더 쿼리가 있다").toMatch(/\brefetch\b/);
    }
  });

  it("오류 분기와 재시도 경로가 있다", () => {
    expect(SOURCE).toMatch(/isError/);
    expect(SOURCE).toMatch(/refetch\(\)/);
    expect(SOURCE).toMatch(/fileTree\.loadError/);
  });

  it("오류 표시는 상태색 토큰을 쓴다", () => {
    // #203 에서 옮긴 규칙. 원색 하드코딩 금지.
    expect(SOURCE).toMatch(/text-destructive/);
    expect(SOURCE).not.toMatch(/text-red-\d{3}/);
  });
});

describe("FileTree 루트 — 빈 상태는 오류가 아닐 때만", () => {
  const SOURCE = readFileSync(
    resolve(process.cwd(), "components/dashboard/FileTree.tsx"),
    "utf8"
  );

  it("오류 분기가 빈 상태보다 앞에 있다", () => {
    // 이게 핵심이다. 순서가 뒤집히면 오류가 다시 빈 상태로 샌다.
    const errIdx = SOURCE.indexOf("if (isError) {");
    const emptyIdx = SOURCE.indexOf(
      "if (rootFolders.length === 0 && rootFiles.length === 0) {"
    );
    expect(errIdx, "루트 오류 분기가 없다").toBeGreaterThan(-1);
    expect(emptyIdx, "루트 빈 상태 분기가 없다").toBeGreaterThan(-1);
    expect(errIdx).toBeLessThan(emptyIdx);
  });
});
