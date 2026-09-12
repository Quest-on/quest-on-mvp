import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures/auth-browser.fixture";
import {
  cleanupTestData,
  seedExam,
  seedSession,
  seedStudentProfile,
} from "../helpers/seed";
import { TIMEOUTS } from "../constants";

/**
 * 시험 상세가 지금 어느 단계인지 아는가 (#385).
 *
 * 한 벌짜리 레이아웃이 배포·감독·검수 세 가지 일을 동시에 맡고 있었고, 모양은
 * 마지막 것으로 고정돼 있었다. 그래서 갓 만든 시험에서도 빈 학생 목록이 화면의
 * 절반을 먹고 입장 코드와 문항 본문은 접힌 아코디언 뒤에 있었다.
 *
 * `lib/exam-detail-phase.ts` 의 단위 테스트는 **판정**을 고정한다. 이 스펙은
 * 그 판정이 실제 화면에서 **무엇을 바꾸는가**를 고정한다. 둘은 다른 것이다 —
 * 판정이 맞아도 화면이 그걸 안 쓰면 사용자에게는 아무 일도 일어나지 않는다.
 */

const ko = (file: string) =>
  JSON.parse(
    readFileSync(path.resolve(__dirname, "../../messages/ko", file), "utf8")
  ) as Record<string, Record<string, string>>;

const AUTHORING = ko("authoring.json");
const INSTRUCTOR = ko("instructor.json");

const HANDOFF = AUTHORING.studentHandoff;
const DETAIL = INSTRUCTOR.examDetail;

/** 문항 본문. 펼쳐져 있는지 보려면 헤더가 아니라 본문을 봐야 한다. */
const QUESTION_TEXT = "구독형 서비스의 가격 인상 조건을 서술하세요.";

const questions = [
  {
    id: "q-0",
    idx: 0,
    type: "essay",
    text: QUESTION_TEXT,
    prompt: QUESTION_TEXT,
  },
];

test.describe("시험 상세 단계별 화면 (#385)", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("배포 단계: 문항이 클릭 없이 펼쳐져 있고 공지문 본문이 보인다", async ({
    instructorPage,
  }) => {
    const exam = await seedExam({
      title: "단계 검증 시험",
      status: "draft",
      questions,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);
    // 제목으로 잡는다. getByText 는 공지문 미리보기 안의 시험명까지 걸려서
    // strict mode 위반이 난다 - 그 자체가 미리보기에 제목이 들어간다는 증거다.
    await expect(
      instructorPage.getByRole("heading", { name: "단계 검증 시험", level: 1 })
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // 1) 문항 본문. 예전에는 접혀 있었고, 펼치면 fetch 가 그때 시작돼 스피너부터 떴다.
    await expect(
      instructorPage.getByText(QUESTION_TEXT),
      "문항이 접혀 있다 - 갓 만든 시험에서 제일 먼저 볼 것이다"
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    // 2) 학생에게 알리기 카드. 입장 코드와 공지문이 한자리에 있어야 한다.
    await expect(
      instructorPage.getByRole("heading", { name: HANDOFF.title })
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
    await expect(instructorPage.getByText(exam.code, { exact: true }).first())
      .toBeVisible();

    // 3) 공지문 **본문**. "공지문 복사" 버튼만으로는 무엇이 복사되는지 알 수 없다.
    const preview = instructorPage.getByTestId("student-notice-preview");
    await expect(preview, "공지문 미리보기가 없다").toBeVisible({
      timeout: TIMEOUTS.ELEMENT_VISIBLE,
    });
    await expect(preview, "미리보기에 입장 코드가 없다").toContainText(exam.code);
  });

  test("배포 단계: 다룰 명단이 없으면 목록 도구도 없다", async ({
    instructorPage,
  }) => {
    const exam = await seedExam({ status: "draft", questions });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await expect(
      instructorPage.getByRole("heading", { name: DETAIL.studentList })
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // 0행 위의 검색창·정렬은 아무 질문에도 답하지 않는다.
    await expect(
      instructorPage.getByPlaceholder(DETAIL.searchPlaceholder),
      "응시자가 0명인데 검색창이 떠 있다"
    ).toHaveCount(0);

    // 빈 화면도 기능의 일부다. 왜 비었고 다음에 뭘 하는지 말해야 한다.
    await expect(
      instructorPage.getByText(DETAIL.noStudentsYetTitle)
    ).toBeVisible();
    await expect(instructorPage.getByText(DETAIL.noStudentsYetHint)).toBeVisible();

    // 내보낼 결과가 없는 단계에서 Excel/CSV 를 띄우지 않는다.
    await instructorPage
      .getByRole("button", { name: AUTHORING.examDetailHeader.moreAria })
      .click();
    await expect(
      instructorPage.getByRole("menuitem", { name: DETAIL.exportExcel }),
      "채점 전인데 내보내기가 메뉴에 있다"
    ).toHaveCount(0);
    await expect(
      instructorPage.getByRole("menuitem", { name: AUTHORING.examDetailHeader.buttonEdit })
    ).toBeVisible();
  });

  test("공지문 복사 결과가 미리보기와 글자 그대로 같다", async ({
    instructorPage,
  }) => {
    // 미리보기와 클립보드를 두 벌로 만들면 한쪽만 고쳐졌을 때 교수자가 화면에서
    // 본 것과 다른 글이 학생에게 나간다. 그 사고는 화면을 봐서는 못 잡는다.
    await instructorPage
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);

    const exam = await seedExam({ title: "복사 검증 시험", status: "draft", questions });

    await instructorPage.goto(`/instructor/${exam.id}`);
    const preview = instructorPage.getByTestId("student-notice-preview");
    await expect(preview).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    const shown = (await preview.innerText()).replace(/\r\n/g, "\n").trim();

    await instructorPage
      .getByRole("button", { name: HANDOFF.copyNotice })
      .click();

    const copied = await instructorPage.evaluate(() =>
      navigator.clipboard.readText()
    );

    expect(copied.replace(/\r\n/g, "\n").trim()).toBe(shown);
    expect(copied, "공지문에 입장 코드가 빠졌다").toContain(exam.code);
  });

  test("감독 단계: 학생이 들어오면 목록 도구가 살아나고 공지문은 접힌다", async ({
    instructorPage,
  }) => {
    const exam = await seedExam({
      title: "감독 검증 시험",
      status: "running",
      questions,
    });
    // 학생 요약은 profiles 를 조인한다. 세션만 넣으면 목록이 비어서 이 스펙이
    // 검증하려는 "학생이 있는 상태" 가 만들어지지 않는다.
    const now = new Date().toISOString();
    await seedStudentProfile("test-student-id", {
      name: "감독 검증 학생",
      student_number: "2024-0001",
    });
    await seedSession(exam.id, "test-student-id", {
      status: "in_progress",
      started_at: now,
      preflight_accepted_at: now,
      attempt_timer_started_at: now,
    });

    await instructorPage.goto(`/instructor/${exam.id}`);
    await expect(
      instructorPage.getByRole("heading", { name: DETAIL.studentList })
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD });

    // 명단이 생겼으면 다룰 수단이 있어야 한다. 여기서 숨으면 교수자가 30명을
    // 검색·정렬할 방법을 잃는다 — setup 판정이 가장 크게 잘못될 수 있는 지점이다.
    await expect(
      instructorPage.getByPlaceholder(DETAIL.searchPlaceholder),
      "학생이 있는데 검색창이 없다"
    ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });

    // 지각 입장자 때문에 코드는 계속 필요하지만, 화면의 주인공은 학생 목록이다.
    await expect(
      instructorPage.getByText(exam.code, { exact: true }).first()
    ).toBeVisible();
    await expect(
      instructorPage.getByTestId("student-notice-preview"),
      "감독 단계인데 공지문 본문이 자리를 차지하고 있다"
    ).toHaveCount(0);
  });
});
