# i18n Inventory — 07 특수페이지/lib

## 요약
- 스캔 파일 수: 16
- 텍스트 보유 파일 수: 11
- 총 추출 문자열 수: 73
- 특이사항 개수: 6

---

## 파일별 상세

### app/error.tsx
파일 요약: 전역 에러 바운더리 — 오류 아이콘, 제목, 동적 메시지, 재시도 버튼 렌더링

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 22 | `예상치 못한 오류가 발생했습니다` | toast-error | `getErrorMessage` fallback 기본값 — 화면에 노출 |
| 31 | `오류가 발생했습니다` | heading | h2 제목 |
| 34 | `다시 시도` | button | 에러 리셋 버튼 |

---

### app/not-found.tsx
파일 요약: 전역 404 페이지 — 로고, 숫자, 오류 메시지, 버튼, 보조 링크

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 24 | `Quest-On Logo` | aria | Image alt |
| 26 | `Quest-On` | label | 브랜드명 — 번역 불필요 확인필요 |
| 50 | `페이지를 찾을 수 없습니다` | heading | h2 |
| 52–55 | `요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.` | body | p 첫 줄 |
| 55 | `URL을 다시 확인해 주세요.` | body | p 두 번째 줄 |
| 68 | `이전 페이지로` | button | `router.back()` 버튼 |
| 90 | `홈으로 돌아가기` | button | 홈 링크 버튼 |
| 98 | `찾고 계신 것이 있나요?` | body | 보조 섹션 리드 문구 |
| 106 | `메인 페이지` | label | 링크 텍스트 |
| 112 | `로그인` | label | 링크 텍스트 |
| 118 | `회원가입` | label | 링크 텍스트 |
| 125 | `문의하기` | label | mailto 링크 텍스트 |
| 121 | `mailto:questonkr@gmail.com?subject=문의사항` | label | mailto subject에 한국어 포함 — 영문화 시 subject 별도 처리 필요. 특이사항 ① |

---

### app/(app)/exam/[code]/error.tsx
파일 요약: 시험 경로 에러 바운더리 — app/error.tsx와 구조 동일, fallback 문구만 다름

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 22 | `시험 페이지에서 오류가 발생했습니다` | toast-error | `getErrorMessage` fallback 기본값 |
| 31 | `오류가 발생했습니다` | heading | h2 (app/error.tsx와 동일 문자열) |
| 34 | `다시 시도` | button | 에러 리셋 버튼 |

---

### app/(app)/exam/[code]/loading.tsx
파일 요약: 시험 페이지 로딩 스켈레톤 — 스피너 + 텍스트

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 6 | `시험을 불러오는 중...` | body | 로딩 설명 텍스트 |

---

### app/(app)/instructor/error.tsx
파일 요약: 강사 경로 에러 바운더리 — app/error.tsx와 구조 동일, fallback 문구만 다름

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 22 | `강사 페이지에서 오류가 발생했습니다` | toast-error | `getErrorMessage` fallback 기본값 |
| 31 | `오류가 발생했습니다` | heading | h2 |
| 34 | `다시 시도` | button | 에러 리셋 버튼 |

---

### app/(app)/instructor/loading.tsx
파일 요약: 강사 대시보드 로딩 — DashboardPageFallback 컴포넌트에 props로 문자열 전달

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 6 | `강사 대시보드를 불러오는 중...` | heading | DashboardPageFallback title prop |
| 7 | `시험 목록과 폴더 구조를 순차적으로 준비하고 있습니다.` | body | DashboardPageFallback description prop |

---

### app/(app)/instructor/[examId]/loading.tsx
파일 요약: 시험 상세 로딩 — 순수 스켈레톤 UI, 사용자 노출 텍스트 없음

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| — | (없음) | — | animate-pulse 스켈레톤만, 텍스트 노출 없음 |

---

### app/(app)/instructor/[examId]/grade/[studentId]/loading.tsx
파일 요약: 채점 페이지 로딩 — 순수 스켈레톤 UI, 사용자 노출 텍스트 없음

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| — | (없음) | — | animate-pulse 스켈레톤만, 텍스트 노출 없음 |

---

### app/(app)/student/error.tsx
파일 요약: 학생 경로 에러 바운더리 — app/error.tsx와 구조 동일, fallback 문구만 다름

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 22 | `학생 페이지에서 오류가 발생했습니다` | toast-error | `getErrorMessage` fallback 기본값 |
| 31 | `오류가 발생했습니다` | heading | h2 |
| 34 | `다시 시도` | button | 에러 리셋 버튼 |

---

### app/(app)/student/loading.tsx
파일 요약: 학생 대시보드 로딩 — DashboardPageFallback 컴포넌트에 props로 문자열 전달

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 6 | `학생 대시보드를 불러오는 중...` | heading | DashboardPageFallback title prop |
| 7 | `세션 목록과 통계를 순차적으로 준비하고 있습니다.` | body | DashboardPageFallback description prop |

---

### app/(app)/student/report/[sessionId]/loading.tsx
파일 요약: 리포트 로딩 — 순수 스켈레톤 UI, 사용자 노출 텍스트 없음

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| — | (없음) | — | animate-pulse 스켈레톤만, 텍스트 노출 없음 |

---

### lib/validations.ts
파일 요약: 전체 앱 Zod 스키마 모음 — 사용자에게 폼 에러로 노출되는 검증 메시지 다수 포함

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 127 | `Message is required` | validation | chatRequestSchema 영문 — 특이사항 ② |
| 127 | `Message too long` | validation | chatRequestSchema 영문 |
| 129 | `Session ID is required` | validation | 영문 |
| 141 | `Message is required` | validation | instructorChatRequestSchema 영문 |
| 141 | `Message too long` | validation | 영문 |
| 143 | `Context is required` | validation | 영문 |
| 150 | `Student reply is required` | validation | submissionReplySchema 영문 |
| 172 | `Username is required` | validation | adminAuthSchema 영문 — 특이사항 ③ (어드민 전용) |
| 172 | `Password is required` | validation | adminAuthSchema 영문 |
| 206 | `Message is required` | validation | caseGradeChatPostSchema 영문 |
| 207 | `Invalid clientMessageId` | validation | 영문 |
| 229 | `Message is required` | validation | bulkGradeChatPostSchema 영문 |
| 237 | `Invalid gradingSessionId` | validation | bulkGradeWorkerSchema 영문 |
| 237 | `Invalid studentSessionId` | validation | 영문 |
| 237 | `Invalid examId` | validation | 영문 |
| 240 | `Invalid attemptId` | validation | 영문 |
| 248 | `Invalid session ID` | validation | bulkGradeCommitSchema 영문 |
| 256 | `At least one grade is required` | validation | 영문 |
| 256 | `Too many grades` | validation | 영문 |
| 269 | `Title is required` | validation | createExamSchema 영문 |
| 283 | `객관식 문제에 정답이 지정되지 않았습니다.` | validation | 한국어 — 특이사항 ④ (한/영 혼재) |
| 298 | `사지선다 문제의 선택지 4개를 모두 입력해주세요.` | validation | 한국어 |
| 311 | `O/X 문제의 선택지 2개를 모두 입력해주세요.` | validation | 한국어 |
| 322 | `정답 인덱스가 선택지 범위를 벗어났습니다.` | validation | 한국어 |
| 369 | `Exam code is required` | validation | initExamSessionSchema 영문 |
| 369 | `Student ID is required` | validation | 영문 |
| 374 | `Invalid exam ID` | validation | createOrGetSessionSchema 영문 |
| 374 | `Student ID is required` | validation | 영문 |
| 379 | `Invalid session ID` | validation | sessionHeartbeatSchema 영문 |
| 380 | `Student ID is required` | validation | 영문 |
| 383 | `Invalid session ID` | validation | deactivateSessionSchema 영문 |
| 384 | `Student ID is required` | validation | 영문 |
| 389 | `Invalid session ID` | validation | saveDraftSchema 영문 |
| 392 | `Answer too long` | validation | 영문 |
| 395 | `Invalid session ID` | validation | saveAllDraftsSchema 영문 |
| 403 | `Invalid session ID` | validation | saveDraftAnswersSchema 영문 |
| 421 | `Answer too long` | validation | answerItemSchema 영문 |
| 425 | `Invalid exam ID` | validation | submitExamSchema 영문 |
| 427 | `Invalid session ID` | validation | 영문 |
| 437 | `Title is required` | validation | createAssignmentSchema 영문 |
| 439 | `Deadline is required` | validation | 영문 |
| 465 | `Invalid session ID` | validation | saveCanvasSchema 영문 |
| 466 | `Canvas content too long` | validation | 영문 |
| 471 | `Invalid session ID` | validation | submitAssignmentSchema 영문 |
| 472 | `Invalid exam ID` | validation | 영문 |
| 477 | `Invalid session ID` | validation | saveFinalAnswerSchema 영문 |
| 478 | `Invalid exam ID` | validation | 영문 |
| 481 | `Final answer too long` | validation | 영문 |
| 484 | `Invalid assignment ID` | validation | updateAssignmentSchema 영문 |
| 498 | `Folder name is required` | validation | createFolderSchema 영문 |
| 502 | `Invalid node ID` | validation | moveNodeSchema 영문 |
| 508 | `Invalid node ID` | validation | deleteNodeSchema 영문 |
| 513 | `Invalid exam ID` | validation | copyExamSchema 영문 |
| 518 | `Message is required` | validation | feedbackChatSchema 영문 |
| 519 | `Message too long` | validation | 영문 |
| 606 | `Invalid request body` | validation | validateRequest 헬퍼 반환 문자열 — 특이사항 ⑤ (API 응답에 노출) |
| 615 | `Invalid gradingSessionId` | validation | bulkGradeChatOptionsSchema 영문 |
| 622 | `Invalid session ID format` | validation | bulkApproveSchema 영문 |
| 622 | `At least one session required` | validation | 영문 |
| 622 | `Maximum 200 sessions per request` | validation | 영문 |

---

### lib/grade-utils.ts
파일 요약: 채점 계산/중복 제거 순수 유틸 — 사용자 노출 텍스트 없음 (내부 열거값 및 로직만)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 362 | `유형별 비중은 1~100 사이의 정수여야 합니다.` | validation | validateScoreWeightsForQuestions 에러 배열 — 화면 노출 확인필요 |
| 365 | `문항이 없는 유형에는 비중을 설정할 수 없습니다.` | validation | 동일 함수 |
| 372 | `문항이 있는 유형에는 1점 이상의 비중을 설정해야 합니다.` | validation | 동일 함수 |

---

### lib/grading-utils.ts
파일 요약: 과제 등급 라벨·점수 변환 유틸 — 한국어 등급 라벨·설명 문자열 포함

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 9 | `우수` | label | AssignmentGradeLabel 타입 값 + scoreToAssignmentLabel 반환값 |
| 9 | `평범` | label | 동일 |
| 9 | `미흡` | label | 동일 |
| 75 | `날짜 없음` | label | formatDateKo fallback — 화면에 노출 |
| 36 | `채팅 리서치 과정, 근거 검증, 퀴즈 이해도 신호가 전반적으로 좋습니다.` | body | getAssignmentGradeDescription("우수") 반환 — 화면 노출 확인필요 |
| 39 | `기본적인 리서치 수행은 보이나 근거 검증이나 자기주도적 판단이 일부 부족합니다.` | body | getAssignmentGradeDescription("평범") 반환 |
| 42 | `리서치 과정, 근거 확인, 이해도 신호가 부족하거나 AI 의존이 큽니다.` | body | getAssignmentGradeDescription("미흡") 반환 |
| 76 | `ko-KR` | format | toLocaleDateString 로케일 하드코딩 — 특이사항 ⑥ |

---

### lib/instructor-utils.ts
파일 요약: 강사 컨텍스트 빌더 및 스켈레톤 표시 유틸 — buildInstructorExamContext 문자열은 AI 프롬프트 컨텍스트용

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| 53 | `시험 제목: ${exam.title}` | ai-prompt | buildInstructorExamContext 반환값 — AI에 전달되는 컨텍스트 블록 |
| 54 | `시험 코드: ${exam.code}` | ai-prompt | 동일 |
| 55 | `시험 상태: ${exam.status}` | ai-prompt | 동일 |
| 56 | `시험 시간: ${exam.duration}분` | ai-prompt | 동일 |
| 57 | `시험 설명: ${exam.description}` | ai-prompt | 동일 (조건부) |
| 58 | `문항 수: ${questions.length}` | ai-prompt | 동일 |
| 59 | `문항(일부):\n${questionsPreview}` | ai-prompt | 동일 |
| 60 | `학생 수: ${total} (완료 ${completed}, 진행중 ${inProgress}, 미시작 ${notStarted})` | ai-prompt | 동일. 보간 변수 4개 — 한국어 어순 고정. 특이사항 → ai-prompt 카테고리로 처리 |
| 61 | `최종채점 완료: ${graded}` | ai-prompt | 동일 |
| 62 | `가채점 점수 보유: ${hasScores}` | ai-prompt | 동일 |

---

### lib/objective-grade-view.ts
파일 요약: 객관식 채점 뷰 순수 헬퍼 — 사용자 노출 텍스트 없음 (로직만)

| Line | 문자열(원문 그대로) | 카테고리 | 비고 |
|------|------|------|------|
| — | (없음) | — | 내부 로직 전용, 화면 노출 텍스트 없음 |

---

## 특이사항 목록

| # | 파일 | 내용 |
|---|------|------|
| ① | app/not-found.tsx | `mailto:` subject에 한국어(`문의사항`) 하드코딩 — 영문 로케일에서 subject도 별도 번역키 필요 |
| ② | lib/validations.ts | Zod 검증 메시지가 한/영 혼재 — `createExamSchema` 내부 4개만 한국어, 나머지 60+개는 영문. 통일 필요 |
| ③ | lib/validations.ts | `adminAuthSchema` 영문 메시지는 어드민 전용 UI에만 노출 — 일반 사용자 미노출 가능성 있으나 확인 필요 |
| ④ | lib/validations.ts | 동일 파일 내 한국어/영문 메시지 혼재(283, 298, 311, 322행 한국어 vs 그 외 영문) — 영문화 시 한국어 4건 우선 처리 대상 |
| ⑤ | lib/validations.ts | `validateRequest` 헬퍼의 `"Invalid request body"` 문자열이 API 응답 body에 포함되어 클라이언트에 노출될 수 있음 |
| ⑥ | lib/grading-utils.ts | `formatDateKo` 내 `"ko-KR"` 로케일 하드코딩 — 영문화 시 로케일을 동적으로 주입하거나 별도 `formatDate` 유틸로 분리 필요 |
