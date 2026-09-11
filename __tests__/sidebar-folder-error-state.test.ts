import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 사이드바 폴더 트리는 오류와 빈 상태를 구분해야 한다.
 *
 * 예전에는 `useQuery` 에서 `isLoading` 만 꺼내 썼다. 요청이 실패하면
 * `isLoading` 이 false 가 되고 `data` 는 기본값 `[]` 로 떨어져서, 결국
 * "폴더 없음" 이 렌더됐다. 폴더로 시험을 관리하는 교수자에게 이건
 * "내 데이터가 사라졌다" 로 읽힌다.
 *
 * 이 파일은 소스 구조만 본다. 문자열 매칭으로 동작을 주장하지 않는다 —
 * 식별자와 메시지 키의 존재/부재만 신뢰한다.
 */
const SOURCE_PATH = resolve(
  process.cwd(),
  "components/instructor/SidebarFolderTree.tsx"
);
const SOURCE = readFileSync(SOURCE_PATH, "utf8");

describe("사이드바 폴더 트리 — 오류 상태", () => {
  it("두 useQuery 가 모두 isError 를 꺼낸다", () => {
    // 루트 목록과 하위 노드 목록 두 곳이다. 한쪽만 고치면 나머지가 계속 거짓말한다.
    const queries = SOURCE.match(/useQuery\(/g) ?? [];
    expect(queries.length, "useQuery 호출 수가 바뀌었다").toBe(2);

    const isErrorUses = SOURCE.match(/\bisError\b/g) ?? [];
    // 각 쿼리마다 구조분해 1회 + 렌더 분기 최소 1회.
    expect(isErrorUses.length).toBeGreaterThanOrEqual(4);
  });

  it("재시도 경로가 있다", () => {
    expect(SOURCE).toMatch(/\brefetch\b/);
    expect(SOURCE).toMatch(/sidebar\.folderRetry/);
  });

  it("오류 문구가 빈 상태 문구와 다르다", () => {
    expect(SOURCE).toMatch(/sidebar\.folderError/);
    expect(SOURCE).toMatch(/sidebar\.folderEmpty/);
    expect(SOURCE).toMatch(/sidebar\.nodeEmpty/);
  });

  it("빈 상태는 오류가 아닐 때만 렌더된다", () => {
    // 이 가드가 핵심이다. !isError 조건이 빠지면 오류가 다시 '폴더 없음' 으로 샌다.
    expect(SOURCE).toMatch(/!isLoading && !isError && rootFolders\.length === 0/);
    expect(SOURCE).toMatch(/!isLoading &&\s*!isError &&/);
  });

  it("오류 표시는 상태색 토큰을 쓴다", () => {
    // #203 에서 옮긴 규칙. 원색 하드코딩 금지.
    expect(SOURCE).toMatch(/text-destructive/);
    expect(SOURCE).not.toMatch(/text-red-\d{3}/);
  });
});
