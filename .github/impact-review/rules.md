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

## Pattern rules (단일 파일 고위험 패턴)

- `QIDX-DEEP-LINKS`: 딥링크·채점 선택은 배열 위치 가정 금지, 명시적 `qIdx`/`idx ?? pos`.
- `OBJECTIVE-SCORING-RAW-ANSWERS`: MCQ/OX 채점은 raw 선택답 + `correctOptionIndex`만. AI grade row나 `ai_summary` placeholder 금지.
- `SCORE-WEIGHT-SYNC`: 문항 유형 버킷과 `score_weights`는 항상 동기화.
- `DB-SAFETY-READ-ONLY`: 리뷰/러너는 read-only. Supabase 연결·마이그레이션·seed·cleanup·`.env.local` source 금지.

## Model guidance (LLM 2차 리뷰용)

모델은 결정적 finding을 제거/강등할 수 없다. 회귀·교차파일 영향만 검토하고, 스타일-온리 지적은 금지. JSON만 반환.

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

  - id: QIDX-DEEP-LINKS
    kind: pattern
    severity: Warning
    anyPath: ["app/", "lib/", "components/"]
    signals:
      - "questions\\[\\s*\\d+\\s*\\]"
      - "\\.questions\\[idx\\]"
      - "deepLink"
      - "qIdx"
    message: "딥링크/채점 선택이 배열 위치를 가정할 수 있습니다. 명시적 qIdx 또는 idx ?? pos 규약을 확인하세요."

  - id: OBJECTIVE-SCORING-RAW-ANSWERS
    kind: pattern
    severity: Warning
    anyPath: ["app/api/", "lib/"]
    signals:
      - "ai_summary"
      - "grade_type"
    message: "MCQ/OX 채점은 raw 선택답 + correctOptionIndex만 사용해야 합니다. AI grade row/ai_summary placeholder 혼입 금지."

  - id: SCORE-WEIGHT-SYNC
    kind: pattern
    severity: Warning
    anyPath: ["app/", "lib/"]
    signals:
      - "score_weights"
      - "scoreWeights"
      - "buildDefaultScoreWeightsForQuestionTypes"
      - "validateScoreWeightsForQuestions"
    message: "문항 유형 변경 시 score_weights를 재동기화해야 합니다. stale weight를 남기지 마세요."

  - id: DB-SAFETY-READ-ONLY
    kind: pattern
    severity: Critical
    anyPath: ["lib/impact-review/", "scripts/impact-review.ts", ".github/workflows/impact-review.yml"]
    signals:
      - "getSupabaseServer"
      - "SUPABASE_SERVICE_ROLE_KEY"
      - "createClient\\("
      - "\\.env\\.local"
      - "prisma"
    message: "Impact-review는 read-only여야 합니다. Supabase/DB/마이그레이션/.env.local 접근 코드가 러너에 들어가면 안 됩니다."
```
