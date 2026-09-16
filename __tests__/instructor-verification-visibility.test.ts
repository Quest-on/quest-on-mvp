import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const json = (p: string) => JSON.parse(read(p)) as Record<string, any>;

/**
 * 교수자가 자기 인증 상태를 볼 수 있어야 한다 (이슈 #395).
 *
 * 인증 계정은 두 한도가 모두 `null` 이라 `resolveCodeGate` 가 항상 `open` 을
 * 돌려준다. 그래서 인증 계정과 "아직 여유 있는 미인증 계정"의 화면이 완전히
 * 같았고, 교수자는 한도에 부딪히는 순간에야 자기가 제약 상태였다는 걸 알았다
 * — 그 순간은 코드를 이미 배포한 뒤다.
 */
describe("계정 상태가 상시 표면에 있다", () => {
  const footer = read("components/dashboard/SidebarFooter.tsx");

  it("인증 상태를 프로필에서 읽는다", () => {
    // quota API 는 instructor 전용(403)인데 이 사이드바는 학생 화면에서도
    // 렌더된다(StudentDashboardClient). 프로필로 실어 나르면 요청도 역할
    // 가드도 안 늘어난다.
    expect(footer).toMatch(/profile\?\.plan === "verified"/);
    expect(read("components/providers/AppAuthProvider.tsx")).toMatch(
      /select\("role, status, plan, display_name, avatar_url"\)/
    );
  });

  it("인증 계정에만 표식을 단다", () => {
    expect(footer).toMatch(/isVerified/);
    expect(footer).toMatch(/BadgeCheck/);
  });

  it("미인증 계정에만 신청 경로를 연다", () => {
    // 인증을 마친 계정에 띄우면 아무 행동도 유도하지 않는 항목이 메뉴만
    // 길게 만든다.
    expect(footer).toMatch(/needsVerification && \(/);
    expect(footer).toMatch(/supportMailto\(t\("footer\.verificationMailSubject"\)\)/);
  });

  it("미인증 계정에 낙인이 될 라벨을 달지 않는다", () => {
    // '미인증'/'무료' 같은 표식을 이름 옆에 상시로 붙이지 않는다. 표식은
    // 인증 계정 쪽에만 있고, 미인증 계정에는 나갈 길만 준다.
    const ko = json("messages/ko/instructor.json").footer;
    expect(ko.verified).toBeTruthy();
    expect(ko.verification).toBeTruthy();
    expect(footer).not.toMatch(/footer\.unverified/);
  });
});

/**
 * 한도 안내는 문장이 아니라 아이콘 뒤에 둔다.
 *
 * ExamCode 는 코드가 보이는 자리마다 렌더되므로 정책 문장을 상시로 깔면
 * 화면마다 같은 줄이 반복된다. 그리고 원 설계(ExamCode.tsx 주석)가 상시
 * 숫자 카운터를 배제한 판단은 그대로 유효하다.
 */
describe("여유 있을 때의 안내가 아이콘 뒤에 있다", () => {
  const source = read("components/instructor/ExamCode.tsx");

  it("open 상태에만, 그리고 상한을 알 때만 뜬다", () => {
    expect(source).toMatch(/showLimits && gate\.level === "open"/);
  });

  it("데모에는 뜨지 않는다", () => {
    const start = source.indexOf("const showLimits =");
    const block = source.slice(start, source.indexOf("return (", start));
    expect(block).toMatch(/!quota\?\.isDemo/);
  });

  it("상한을 모르면 뜨지 않는다 — 인증 계정이 여기서 자연히 빠진다", () => {
    const start = source.indexOf("const showLimits =");
    const block = source.slice(start, source.indexOf("return (", start));
    expect(block).toMatch(/maxPublishes !== null/);
    expect(block).toMatch(/maxStudents !== null/);
  });

  it("숫자를 메시지에 박지 않고 API 값을 쓴다", () => {
    // 3·5 를 문구에 박으면 plan_limits 와 갈라진다. 그 테이블은 사고 시
    // UPDATE 한 줄로 한도를 푸는 복구 수단이라, 갈라지는 순간 화면이
    // 거짓말을 한다.
    for (const locale of ["ko", "en"]) {
      const examCode = json(`messages/${locale}/authoring.json`).examCode;
      expect(examCode.limitExamsValue).toMatch(/\{count\}/);
      expect(examCode.limitStudentsValue).toMatch(/\{count\}/);
      for (const [key, value] of Object.entries(examCode)) {
        expect(String(value), `${locale}.examCode.${key} 에 한도 숫자가 박혀 있다`).not.toMatch(
          /(시험|학생|exams?|students?)\s*3개|5명/i
        );
      }
    }
  });

  it("반직관적인 산정 규칙을 숫자 옆에 적는다", () => {
    // 발행 카운트는 "만든 시험 수"가 아니라 "첫 학생이 들어온 시험 수"다.
    expect(json("messages/ko/authoring.json").examCode.limitNote).toMatch(/첫 학생/);
    expect(json("messages/en/authoring.json").examCode.limitNote).toMatch(/first student/i);
  });
});

/**
 * 한 제품이 같은 것을 세 이름으로 부르지 않는다.
 *
 * 학생 화면은 "교수자 계정 인증"(auth.json), 교수자 화면은 "무료 등급"·
 * "무료 플랜", 관리자 화면은 "승인" 이었다. 학생에게 이미 인증이라고 말하고
 * 있으므로 교수자 화면이 그 말에 맞춘다.
 */
describe("어휘가 '인증' 하나로 모여 있다", () => {
  it("교수자 한도 문구에 '무료 등급'·'무료 플랜' 이 없다", () => {
    const examCode = json("messages/ko/authoring.json").examCode;
    for (const [key, value] of Object.entries(examCode)) {
      expect(String(value), `ko.examCode.${key}`).not.toMatch(/무료 (등급|플랜)/);
    }
  });

  it("해제 경로가 인증 신청이라고 말한다", () => {
    expect(json("messages/ko/authoring.json").examCode.blockedCta).toMatch(/인증/);
    expect(json("messages/ko/authoring.json").examCode.blockedMailSubject).toMatch(/인증/);
    expect(json("messages/en/authoring.json").examCode.blockedCta).toMatch(/verification/i);
  });

  it("학생 화면이 쓰던 말과 같은 말을 쓴다", () => {
    // auth.json 은 예전부터 학생에게 "교수자 계정 인증" 이라고 말해 왔다.
    expect(json("messages/ko/auth.json").join.publishLimitReached).toMatch(/인증/);
  });
});

describe("쿼터 API 가 상한을 내보낸다", () => {
  const src = read("app/api/instructor/quota/route.ts");

  it("잔여와 상한을 모두 내보낸다", () => {
    expect(src).toMatch(/maxPublishes: limits\.maxPublishes/);
    expect(src).toMatch(/maxStudents: limits\.maxStudents/);
  });

  it("판정 불능은 두 상한 모두 null 이다 — fail-open", () => {
    expect(src).toMatch(/maxPublishes: null/);
    expect(src).toMatch(/maxStudents: null/);
  });
});
