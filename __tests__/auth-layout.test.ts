import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const AUTH_SCREENS = [
  "components/auth/CustomSignIn.tsx",
  "components/auth/CustomSignUp.tsx",
];

/** 브랜드 로고를 감싼 `<Link>` 블록만 잘라낸다. */
function logoBlock(src: string): string {
  const anchor = src.indexOf('alt={t("logoAlt")}');
  if (anchor < 0) throw new Error("로고 Image 를 못 찾았다");
  // 로고 Image 바로 앞의 <Link 부터 그 </Link> 까지.
  const open = src.lastIndexOf("<Link", anchor);
  const close = src.indexOf("</Link>", anchor);
  if (open < 0 || close < 0) throw new Error("로고 Link 경계를 못 찾았다");
  return src.slice(open, close);
}

/**
 * className 을 토큰 집합으로 본다. 클래스 순서를 바꾸거나 중간에 하나 끼워 넣어도
 * 깨지지 않게 — 검사하려는 건 배치지 문자열이 아니다.
 */
function hasAllClasses(src: string, ...required: string[]): boolean {
  // 줄 단위로 끊는다. 파일 전체를 한 번에 훑으면 따옴표 쌍이 어긋난 채 누적돼
  // 실제로 있는 className 을 못 찾는다 (여기서 한 번 당했다).
  return src.split(/\r?\n/).some((line) =>
    [...line.matchAll(/"([^"]+)"/g)]
      .map((m) => new Set(m[1].split(/\s+/).filter(Boolean)))
      .some((tokens) => required.every((c) => tokens.has(c)))
  );
}

/**
 * 로그인·가입 화면에서 로고가 제목을 덮지 않는다 (이슈 #415).
 *
 * 예전에는 로고가 `absolute top-8 left-8` 이라 레이아웃에서 자리를 차지하지
 * 않았다. 폼 컬럼은 세로 중앙 정렬이라 폼이 짧으면 컬럼 상단이 로고와 같은
 * 띠에 들어왔고, 뷰포트가 좁아져 `max-w-md` 컬럼이 왼쪽으로 밀리면 가로로도
 * 겹쳤다. 프로덕션 1440x900 실측:
 *
 *   1440px : overlap=true   h1.x=92   로고 오른쪽 끝=153
 *   1920px : overlap=false  h1.x=256  로고 오른쪽 끝=153
 *
 * 1440x900 은 흔한 노트북 해상도다. 로고를 레이아웃에 참여시키면 어느 폭에서도
 * 겹칠 수 없다 — 좌표 계산이 아니라 구조로 막는다.
 */
describe("인증 화면 로고가 폼을 덮지 않는다", () => {
  for (const file of AUTH_SCREENS) {
    it(`${file.split("/").pop()} — 로고가 절대 배치가 아니다`, () => {
      const block = logoBlock(read(file));
      expect(block, "로고가 absolute 라 폼과 같은 자리에 놓일 수 있다").not.toMatch(
        /\babsolute\b/
      );
    });

    it(`${file.split("/").pop()} — 폼이 남은 공간의 중앙에 놓인다`, () => {
      // 로고가 흐름에 들어왔으므로, 폼은 로고 아래 남은 높이에서 중앙 정렬돼야
      // 예전과 같은 모양이 된다.
      expect(
        hasAllClasses(read(file), "flex-1", "flex", "items-center", "justify-center"),
        `${file} — 폼을 감싼 중앙 정렬 래퍼가 없다`
      ).toBe(true);
    });
  }

  it("좌측 패널이 세로 스택이다 — 로고 다음에 폼", () => {
    // items-center 로 겹쳐 쌓으면 로고와 폼이 같은 칸을 두고 경쟁한다.
    for (const file of AUTH_SCREENS) {
      expect(
        hasAllClasses(read(file), "flex-1", "flex", "flex-col", "bg-background"),
        `${file} — 좌측 패널이 세로 스택이 아니다`
      ).toBe(true);
    }
  });
});
