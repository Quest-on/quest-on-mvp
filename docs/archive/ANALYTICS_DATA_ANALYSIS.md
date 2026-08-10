# 시험 데이터/로그 분석 리포트

## 📊 현재 수집 가능한 데이터

### 1. 시험 메타데이터 (exams 테이블)

- ✅ `exam_id`, `title`, `code`
- ✅ `instructor_id`
- ✅ `rubric` (JSON 배열) - 평가 영역별 기준
- ✅ `questions` (JSON 배열) - 문제 정보
- ✅ `created_at`, `updated_at`
- ✅ `student_count` - 제출 학생 수

### 2. 세션 데이터 (sessions 테이블)

- ✅ `session_id`, `exam_id`, `student_id`
- ✅ `used_clarifications` - Clarification 질문 수
- ✅ `created_at` - 시험 시작 시간
- ✅ `submitted_at` - 제출 시간
- ✅ `ai_summary` (JSON) - AI 자동 채점 요약 평가

**계산 가능한 지표:**

- 시험 소요 시간: `submitted_at - created_at`
- Clarification 질문 수: `used_clarifications`

### 3. AI 대화 로그 (messages 테이블)

- ✅ `session_id`, `q_idx` - 어떤 문제에 대한 대화인지
- ✅ `role` - "user" 또는 "ai"
- ✅ `content` - 메시지 내용
- ✅ `created_at` - 메시지 시간
- ✅ `response_id` - OpenAI API 응답 ID (토큰 추적 가능)

**계산 가능한 지표:**

- 문제별 Clarification 질문 수
- Clarification 질문 시간 분포
- AI 응답 시간 간격

**⚠️ 추가 수집 필요:**

- 메시지 타입 분류 (개념/계산/전략 질문) - 현재 없음
- 토큰 사용량 - `response_id`로 OpenAI API에서 추출 가능

### 4. 답안 정보 (submissions 테이블)

- ✅ `session_id`, `q_idx`
- ✅ `answer` - 최종 답안 텍스트
- ✅ `ai_feedback` (JSON) - AI 피드백
- ✅ `student_reply` - Reflection 답변
- ✅ `created_at` - 답안 작성 시간

**계산 가능한 지표:**

- 답안 글자 수: `answer.length`
- Reflection 라운드 수: `student_reply` 존재 여부 (1 또는 0)
- 피드백 반영 여부: `student_reply` 존재 여부

**⚠️ 추가 수집 필요:**

- 답안 수정 횟수 - 현재 없음 (초안/수정본 추적 불가)
- 답안 작성 시간 추적 - `created_at`만 있음 (수정 시간 없음)

### 5. 루브릭 기반 점수 (grades 테이블)

- ✅ `session_id`, `q_idx`
- ✅ `score` - 전체 점수 (0-100)
- ✅ `comment` - 평가 코멘트
- ✅ `stage_grading` (JSON) - 단계별 점수:
  - `chat` - Clarification 단계 점수
  - `answer` - 답안 작성 단계 점수
  - `feedback` - Reflection 단계 점수

**계산 가능한 지표:**

- 문제별 평균 점수
- 단계별 평균 점수 (chat/answer/feedback)
- 루브릭 항목별 점수 분포 (stage_grading에서 추출)

**⚠️ 추가 수집 필요:**

- 루브릭 항목별 세부 점수 - 현재는 전체 점수만 있음
  - 예: "정보 탐색: 2.8/5", "논리 구조: 3.9/5" 같은 세부 점수 없음

---

## 🎯 지금 당장 만들 수 있는 차트/그래프

### 교수 대시보드

#### 1. 시험 Overview

- ✅ **평균 점수, 최고/최저 점수, 표준편차**
  - 데이터: `grades.score` 집계
- ⚠️ **루브릭 항목별 평균 (레이다 차트)**
  - 현재: `stage_grading`에서 chat/answer/feedback 3단계만 가능
  - 필요: 루브릭 항목별 세부 점수 (예: "정보 탐색", "논리 구조" 등)

#### 2. AI 활용 vs 성과

- ✅ **산점도: Clarification 질문 수 vs 최종 점수**
  - X축: `sessions.used_clarifications`
  - Y축: `grades.score` 평균
- ⚠️ **히트맵: 질문 타입 vs 점수대 분포**
  - 현재: 질문 타입 분류 없음
  - 필요: 메시지 타입 분류 (개념/계산/전략)
- ✅ **"AI에 질문한 비율" vs "고득점 여부"**
  - 데이터: `used_clarifications > 0` vs `score >= 80`

#### 3. 수업 개선용 인사이트

- ⚠️ **Clarification에서 가장 많이 물어본 개념 TOP 5**
  - 현재: `messages.content` 텍스트 분석 필요
  - 필요: 메시지 내용에서 키워드 추출 (NLP 또는 간단한 키워드 매칭)

### 학생 대시보드

#### 1. 시험 결과 요약

- ✅ **내 최종 점수 + 등급**
  - 데이터: `grades.score` 평균
- ✅ **"내 점수 vs 반 평균" 그래프**
  - 데이터: 내 점수 vs 전체 평균

#### 2. 역량 레이더 차트

- ⚠️ **루브릭 항목별 점수**
  - 현재: `stage_grading`의 chat/answer/feedback 3단계만 가능
  - 필요: 루브릭 항목별 세부 점수
- ✅ **"나" vs "반 평균" Overlap**
  - 데이터: 내 `stage_grading` vs 전체 평균

#### 3. 과정 리뷰

- ✅ **Clarification 질문 수**
  - 데이터: `sessions.used_clarifications`
- ⚠️ **질문 유형 분포**
  - 현재: 질문 타입 분류 없음
- ✅ **Reflection 라운드 수**
  - 데이터: `submissions.student_reply` 존재 여부 카운트
- ✅ **AI 피드백 요약**
  - 데이터: `submissions.ai_feedback` 텍스트

---

## 🔧 추가 수집이 필요한 데이터 (MVP 기준)

### 1. 메시지 타입 분류 (높은 우선순위)

**목적:** 질문 유형 분석 (개념/계산/전략)

**방법:**

- `messages` 테이블에 `message_type` 컬럼 추가
- 또는 `metadata` JSON 필드에 `{ "type": "concept" | "calculation" | "strategy" }` 저장
- AI가 메시지 저장 시 자동 분류하거나, 나중에 배치 처리로 분류

**사용처:**

- 히트맵: 질문 타입 vs 점수대 분포
- 학생 대시보드: "너는 개념 질문은 잘하지만 전략 질문이 적다"

### 2. 루브릭 항목별 세부 점수 (높은 우선순위)

**목적:** 루브릭 항목별 레이더 차트

**방법:**

- `grades.stage_grading` JSON 구조 확장:

```json
{
  "chat": {
    "score": 75,
    "comment": "...",
    "rubric_scores": { "정보 탐색": 3, "논리 구조": 4 }
  },
  "answer": {
    "score": 80,
    "comment": "...",
    "rubric_scores": { "정보 탐색": 4, "논리 구조": 4 }
  },
  "feedback": {
    "score": 70,
    "comment": "...",
    "rubric_scores": { "정보 탐색": 3, "논리 구조": 3 }
  }
}
```

- 채점 시 AI가 루브릭 항목별 점수도 함께 반환하도록 프롬프트 수정

**사용처:**

- 교수 대시보드: 루브릭 항목별 평균 레이더 차트
- 학생 대시보드: 역량 레이더 차트

### 3. 답안 수정 추적 (중간 우선순위)

**목적:** 답안 작성 습관 분석

**방법:**

- `submissions` 테이블에 `answer_history` JSON 필드 추가
- 또는 별도 `answer_versions` 테이블 생성
- 프론트엔드에서 답안 저장 시마다 버전 기록

**사용처:**

- "답안 수정 횟수 vs 점수" 상관관계 분석

### 4. 토큰 사용량 (낮은 우선순위)

**목적:** AI 비용 분석

**방법:**

- `messages` 테이블에 `tokens_used` 컬럼 추가
- OpenAI API 응답에서 `usage` 객체 추출하여 저장
- `response_id`로 나중에 OpenAI API에서 조회 가능

**사용처:**

- 교수 대시보드: 시험별 AI 비용 통계

---

## 📈 구현 우선순위

### Phase 1: 즉시 구현 가능 (현재 데이터로)

1. ✅ 교수 대시보드: 시험 Overview (평균/최고/최저/표준편차)
2. ✅ 교수 대시보드: Clarification 질문 수 vs 점수 산점도
3. ✅ 학생 대시보드: 내 점수 vs 반 평균
4. ✅ 학생 대시보드: 단계별 점수 (chat/answer/feedback)

### Phase 2: 데이터 수집 추가 후 구현

1. 메시지 타입 분류 추가 → 질문 유형 히트맵
2. 루브릭 항목별 세부 점수 추가 → 레이더 차트
3. 답안 수정 추적 추가 → 답안 작성 습관 분석

### Phase 3: 고급 분석

1. NLP 기반 질문 키워드 추출 → "가장 많이 물어본 개념 TOP 5"
2. 토큰 사용량 추적 → AI 비용 분석

---

## 🛠️ 다음 단계

1. **데이터 수집 강화**

   - 메시지 타입 분류 로직 추가
   - 루브릭 항목별 세부 점수 채점 로직 수정

2. **분석 API 개발**

   - `/api/analytics/exam/[examId]/overview` - 교수용 시험 통계
   - `/api/analytics/exam/[examId]/student/[studentId]` - 학생용 개인 통계

3. **대시보드 UI 개발**
   - 교수 대시보드 페이지
   - 학생 대시보드 페이지
   - 차트 라이브러리 통합 (Recharts 또는 Chart.js)
