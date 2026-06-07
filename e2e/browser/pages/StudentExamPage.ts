import { Page, Locator } from "@playwright/test";

export class StudentExamPage {
  constructor(private page: Page) {}

  get answerArea(): Locator {
    return this.page.getByPlaceholder(/답안을 작성/i);
  }

  get submitBtn(): Locator {
    return this.page.locator('[data-testid="exam-submit-btn"]');
  }

  get saveIndicator(): Locator {
    return this.page.locator('[data-testid="save-status"]');
  }

  get preflightHeading(): Locator {
    return this.page.getByRole("heading", { name: /시험 시작 전 안내사항/ });
  }

  get preflightRulesCheckbox(): Locator {
    return this.page.locator('[data-testid="preflight-rules-checkbox"]');
  }

  get preflightAiLogCheckbox(): Locator {
    return this.page.locator('[data-testid="preflight-ailog-checkbox"]');
  }

  get preflightAcceptBtn(): Locator {
    return this.page.locator('[data-testid="preflight-accept-btn"]');
  }

  get waitingRoom(): Locator {
    return this.page.locator('[data-testid="waiting-room"]');
  }

  async goto(code: string) {
    await this.page.goto(`/exam/${code}`);
  }

  async typeAnswer(text: string) {
    await this.answerArea.click();
    await this.answerArea.fill(text);
  }

  async manualSave() {
    await this.page.keyboard.press("Control+s");
  }

  async acceptPreflight() {
    await this.preflightRulesCheckbox.click();
    await this.preflightAiLogCheckbox.click();
    await this.preflightAcceptBtn.click();
  }

  /** Accept preflight for an objective-only exam (no AI log checkbox). */
  async acceptPreflightRulesOnly() {
    await this.preflightRulesCheckbox.click();
    await this.preflightAcceptBtn.click();
  }

  questionNav(index: number): Locator {
    return this.page.locator(`[data-testid="exam-question-nav-${index}"]`);
  }

  get nextBtn(): Locator {
    return this.page.locator('[data-testid="exam-next-btn"]');
  }

  /**
   * 단방향 진행: 다음 문제로 전진한다(임의 점프·되돌아가기 불가).
   * 객관식은 답을 선택해야 다음 버튼이 활성화된다.
   */
  async nextQuestion() {
    await this.nextBtn.click();
  }

  /** Returns the nth objective option by index (0-based). */
  objectiveOption(index: number): Locator {
    return this.page.locator(`[data-testid="objective-option-${index}"]`);
  }

  get floatingChatButton(): Locator {
    return this.page.locator('[aria-label="AI 채팅 열기"]');
  }

  get chatSidebarClose(): Locator {
    return this.page.locator('[aria-label="채팅 사이드바 닫기"]');
  }

  get questionCollapseBtn(): Locator {
    return this.page.locator('[aria-label="문제 접기"]');
  }

  get questionExpandBtn(): Locator {
    return this.page.locator('[aria-label="문제 보기"]');
  }

  get essayAnswerArea(): Locator {
    return this.page.getByPlaceholder("여기에 상세한 답안을 작성하세요...");
  }

  get examTimer(): Locator {
    return this.page.locator('[data-testid="exam-timer"]');
  }
}
