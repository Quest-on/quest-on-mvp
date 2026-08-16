import { Page, Locator } from "@playwright/test";

export class InstructorCreateExamPage {
  constructor(private page: Page) {}

  get pageHeading(): Locator {
    return this.page.getByText(/새로운 시험 만들기|시험 만들기/i);
  }

  get titleInput(): Locator {
    return this.page.getByLabel("시험 제목");
  }

  get codeInput(): Locator {
    return this.page.locator("#code");
  }

  get manualQuestionsToggle(): Locator {
    return this.page.getByTestId("manual-questions-toggle");
  }

  get addQuestionBtn(): Locator {
    return this.page.locator(
      '[data-testid="add-question-btn"], [data-testid="empty-add-question-btn"]'
    );
  }

  questionArea(index = 0): Locator {
    return this.page.getByTestId(`question-editor-input-${index}`);
  }

  get submitDisabledReasons(): Locator {
    return this.page.getByTestId("create-exam-submit-reasons");
  }

  get submitBtn(): Locator {
    return this.page.getByRole("button", { name: /출제하기|출제/i });
  }

  get successDialog(): Locator {
    return this.page.getByText(/출제 완료/i);
  }

  async goto() {
    await this.page.goto("/instructor/new");
  }

  async ensureManualQuestionsOpen() {
    if (
      !(await this.addQuestionBtn.first().isVisible().catch(() => false)) &&
      (await this.manualQuestionsToggle.isVisible().catch(() => false))
    ) {
      await this.manualQuestionsToggle.click();
    }
  }

  /**
   * Open the "+" picker and add a question.
   *
   * The picker defaults to `multiple-choice`, which requires options +
   * correctOptionIndex to satisfy submitReasons validation. Tests that only
   * fill prompt text (the common case) need an essay question so the submit
   * button enables after `fillQuestion`. Override `questionType` when a test
   * specifically needs MCQ/OX behaviour.
   */
  async addQuestion(
    questionType: "essay" | "multiple-choice" | "true-false" = "essay",
  ) {
    await this.ensureManualQuestionsOpen();
    // "+" 트리거가 문제 유형 선택 다이얼로그를 연다.
    await this.addQuestionBtn.first().click();
    // 다이얼로그가 열릴 때까지 대기
    const picker = this.page.getByTestId("add-question-picker");
    await picker.waitFor({ state: "visible" });
    // 유형 선택 — 기본 multiple-choice 외에는 명시적으로 클릭한다.
    if (questionType !== "multiple-choice") {
      await this.page.locator(`#question-type-${questionType}`).click();
    }
    // 다이얼로그의 "추가" 버튼이 선택한 유형의 빈 문제를 목록에 추가한다.
    await this.page.getByTestId("manual-add-question-btn").click();
    // 다이얼로그가 닫힐 때까지 대기
    await picker.waitFor({ state: "hidden" });
  }

  async fillQuestion(text: string, index = 0) {
    const editor = this.questionArea(index);
    if (!(await editor.isVisible().catch(() => false))) {
      await this.addQuestion();
    }
    await editor.click();
    await editor.fill(text);
  }
}
