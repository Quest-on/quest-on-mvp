import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { qk } from "@/lib/query-keys";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/** `/api/instructor/quota` 를 조회하는 화면 전부. */
const QUOTA_SCREENS = [
  "app/(app)/instructor/new/page.tsx",
  "app/(app)/instructor/assignment/new/page.tsx",
  "app/(app)/instructor/[examId]/page.tsx",
  "components/instructor/InstructorHomeClient.tsx",
];

/**
 * 한 엔드포인트는 캐시 한 칸만 쓴다 (이슈 #394).
 *
 * `qk.instructor.quota(userId?)` 는 인자 유무로 키가 갈린다. 네 화면 중
 * 셋이 인자 없이, 하나가 `user?.id` 를 넣어 부르고 있었다. 그래서 같은
 * 응답이 `["instructor-quota"]` 와 `["instructor-quota", id]` 두 칸에
 * 따로 담겼고, 목록과 상세가 동시에 서로 다른 잔여량을 보여줄 수 있었다.
 *
 * 인자 없는 형태는 **무효화용 프리픽스**다. 조회 키가 아니다.
 */
describe("quota 쿼리 키가 하나다", () => {
  it("모든 화면이 조회 키에 사용자 id 를 넣는다", () => {
    const offenders = QUOTA_SCREENS.filter((f) =>
      /queryKey:\s*qk\.instructor\.quota\(\s*\)/.test(read(f))
    );

    expect(
      offenders,
      "무효화용 프리픽스를 조회 키로 쓰고 있다 — 캐시가 갈린다"
    ).toEqual([]);
  });

  it("네 화면이 실제로 같은 키 형태를 쓴다", () => {
    const shapes = new Set(
      QUOTA_SCREENS.map((f) => {
        const m = read(f).match(/queryKey:\s*qk\.instructor\.quota\(([^)]*)\)/);
        return m ? m[1].trim() : "없음";
      })
    );

    expect(shapes, `키 형태가 갈렸다: ${[...shapes].join(" / ")}`).toHaveLength(1);
  });

  it("프리픽스가 구체 키를 덮는다 — 무효화가 통한다", () => {
    const prefix = qk.instructor.quota();
    const concrete = qk.instructor.quota("user-1");

    expect(concrete.slice(0, prefix.length)).toEqual([...prefix]);
    expect(concrete).not.toEqual(prefix);
  });
});

/**
 * `ExamCard` 는 임포트하는 곳이 없는 죽은 파일이었다.
 *
 * 그냥 안 쓰이는 것이면 두고 볼 수도 있지만, 이 파일만 quota 응답의
 * 학생 상한을 **per-exam 잔여인 척** 그대로 넘겼다. 되살리는 사람은
 * 그 차이를 모르고 5명을 받은 시험을 "5자리 남음"으로 판정하게 된다.
 */
describe("되살리면 틀리는 죽은 파일을 남기지 않는다", () => {
  it("ExamCard 가 없다", () => {
    expect(existsSync(resolve(root, "components/instructor/ExamCard.tsx"))).toBe(
      false
    );
  });
});
