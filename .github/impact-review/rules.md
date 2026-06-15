<!--
  Impact-Review 도메인 규칙 카탈로그 (canonical source).
  - 이 파일이 단일 정본이다. CLAUDE.md / AGENTS.md 는 여기로 교차링크만 한다.
  - 사람용 Markdown 설명 + 아래 ```yaml impact-review-rules``` 블록(기계 파싱용)으로 구성.
  - 결정적 규칙은 모델 호출 전에 평가되어 최종 비-거부(non-vetoable) finding을 만든다.
  - 거울(mirror) 면제는 "같은 차원(dimension)의 공용 헬퍼 hunk"가 있을 때만 적용된다.
    무관한 공용모듈 변경은 같은 커밋이라도 거울 Critical을 억제하지 못한다.
-->

# Impact-Review Domain Rules

quest-on 변경 영향/회귀 자동 리뷰가 사용하는 결정적 규칙과 모델 가이드.

## Mirror rules (거울 쌍)

생성(new)·수정(edit) 폼은 거울이다. 한쪽만 바뀌면 짝도 같이 바뀌어야 한다.
한쪽 mirror 파일만 변경되고 `watch` 패턴이 매치되면 → **Critical(confidence 100)**.
단, 변경 차원이 `exemptions`의 same-dimension 공용 헬퍼 hunk로 커버되면 면제.

- `MIRROR-EXAM-AUTHORING-FORMS`: `instructor/new` ↔ `instructor/[examId]/edit`
- `MIRROR-ASSIGNMENT-AUTHORING-FORMS`: `instructor/assignment/new` ↔ `instructor/assignment/[assignmentId]/edit`

## Convention checks (AI 레인이 판단 — 정규식 아님)

아래는 결정적 규칙이 아니라 **AI 리뷰 레인이 코드 의미를 보고 판단**할 가이드다.
(정규식 패턴 룰은 오탐이 많아 제거했고, 의미 판단은 모델에게 맡긴다.)

- **qIdx 딥링크:** 딥링크·채점 선택은 배열 위치를 가정하지 말 것. 명시적 `qIdx` 또는 테스트된 `idx ?? pos` 규약.
- **객관식 채점:** MCQ/OX 채점은 raw 선택답 + `correctOptionIndex`만 사용. AI grade row나 `ai_summary` placeholder 혼입 금지.
- **점수 비중:** 문항 유형 세트와 `score_weights`는 항상 동기화. stale weight 금지.
- **DB 영향(파일로만):** 마이그레이션/스키마 변경은 `database/NNN_*.sql`(DDL·제약·RLS·인덱스 = source of truth)과 `prisma/schema.prisma`를 **읽어서** 판단 — RLS 누락, 위험한 backfill(NOT NULL+default), 인덱스 누락 등. **라이브 DB에는 절대 접속하지 않는다.**
- **리뷰어 read-only 자기보존:** `lib/impact-review/*`·`scripts/impact-review.ts`·워크플로 자체가 Supabase/DB 연결·`.env.local` source·migration/seed 실행 코드를 넣으면 안 된다(러너는 파일 read 전용).

## Model guidance (LLM 레인용)

모델은 결정적 finding을 제거/강등할 수 없다. 위 convention + 회귀·교차파일·아키텍처 영향을 검토하고, 스타일-온리 지적은 금지. JSON만 반환.

```yaml impact-review-rules
version: 1
rules:
  - id: MIRROR-EXAM-AUTHORING-FORMS
    kind: mirror
    severity: Critical
    sides:
      create: "app/(app)/instructor/new/page.tsx"
      edit: "app/(app)/instructor/[examId]/edit/page.tsx"
    reviewContextModules:
      - "lib/authoring-validation.ts"
      - "lib/grade-utils.ts"
    watch:
      - isQuestionContentEmpty
      - isObjectiveQuestionIncomplete
      - submitReasons
      - validateScoreWeightsForQuestions
      - buildDefaultScoreWeightsForQuestionTypes
      - scoreWeights
      - chatWeight
      - questions
      - correctOptionIndex
      - options
      - materials
      - materials_text
      - language
      - duration
      - status
      - create_exam
      - update_exam
    exemptions:
      - dimension: question-empty-validation
        helper: "lib/authoring-validation.ts"
        mirrorWatch: ["isQuestionContentEmpty", "questions"]
        helperHunk: ["isQuestionContentEmpty", "replace(/<[^>]*>/g", "&nbsp;", "trim()"]
      - dimension: objective-validation
        helper: "lib/authoring-validation.ts"
        mirrorWatch: ["isObjectiveQuestionIncomplete", "correctOptionIndex", "options"]
        helperHunk: ["isObjectiveQuestionIncomplete", "correctOptionIndex", "options", "multiple-choice", "true-false"]
      - dimension: score-weight-validation
        helper: "lib/grade-utils.ts"
        mirrorWatch: ["validateScoreWeightsForQuestions", "buildDefaultScoreWeightsForQuestionTypes", "scoreWeights"]
        helperHunk: ["validateScoreWeightsForQuestions", "buildDefaultScoreWeightsForQuestionTypes", "syncScoreWeightsForBuckets", "scoreBucketForQuestionType"]

  - id: MIRROR-ASSIGNMENT-AUTHORING-FORMS
    kind: mirror
    severity: Critical
    sides:
      create: "app/(app)/instructor/assignment/new/page.tsx"
      edit: "app/(app)/instructor/assignment/[assignmentId]/edit/page.tsx"
    reviewContextModules:
      - "lib/authoring-validation.ts"
      - "components/instructor/ExamInfoForm.tsx"
      - "components/instructor/QuestionsList.tsx"
      - "components/instructor/CaseQuestionGenerator.tsx"
      - "lib/date-utils.ts"
    watch:
      - isQuestionContentEmpty
      - fieldErrors
      - deadline
      - close_at
      - deadlineISO
      - questions
      - Question
      - CaseQuestionGenerator
      - onQuestionsAccepted
      - QuestionsList
      - language
      - generateExamCode
      - codeReadOnly
      - has_sessions
      - create_assignment
      - update_assignment
      - assignment_prompt
      - rubric
      - materials_text
      - 'mode="assignment"'
      - '23:59:00+09:00'
      - 'type: "report"'
    exemptions:
      - dimension: question-empty-validation
        helper: "lib/authoring-validation.ts"
        mirrorWatch: ["isQuestionContentEmpty", "questions"]
        helperHunk: ["isQuestionContentEmpty", "replace(/<[^>]*>/g", "&nbsp;", "trim()"]
      # deadline-normalization: 양쪽이 같은 deadline 헬퍼를 공유하기 전까지 면제 없음.
      #   lib/date-utils.ts 변경은 review context 일 뿐 거울 Critical 억제 안 함.
      # shared-ui-contract: ExamInfoForm/QuestionsList/CaseQuestionGenerator 컴포넌트-온리 변경은
      #   review context/blast-radius 입력일 뿐, 거울 Critical 억제자가 아님.

```
