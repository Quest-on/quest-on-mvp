# 시스템 프롬프트 인벤토리

현재 프로젝트에 존재하는 모든 시스템 프롬프트를 정리한 문서입니다.

## 1. 학생 채팅 시스템 프롬프트

**위치**: `app/api/chat/route.ts`

### 1-1. `buildSystemPrompt()` - 루브릭 있는 경우
- **함수**: `buildSystemPrompt()` (라인 404-514)
- **사용 위치**: 학생 시험 중 AI 채팅
- **특징**: 루브릭이 있는 경우와 없는 경우 두 가지 버전
- **주요 내용**:
  - 시험 컨텍스트 (examTitle, examCode, questionId, 문제 내용)
  - 수업 자료 우선 원칙
  - 평가 루브릭 (있는 경우)
  - 교수자 역할 정의
  - 답변 규칙 (마크다운, 한 문장 제한 등)

### 1-2. `buildMaterialsPriorityInstruction()` - 수업 자료 우선 원칙
- **함수**: `buildMaterialsPriorityInstruction()` (라인 132-153)
- **사용 위치**: `buildSystemPrompt()` 내부에서 사용
- **목적**: 수업 자료가 없을 때의 폴백 프롬프트

## 2. 교수 채팅 시스템 프롬프트

**위치**: `app/api/instructor/chat/route.ts`

### 2-1. `buildInstructorSystemPrompt()`
- **함수**: `buildInstructorSystemPrompt()` (라인 122-157)
- **사용 위치**: 교수용 AI 어시스턴트 채팅
- **주요 내용**:
  - 시험 관리 및 채점 보조 역할
  - 컨텍스트 기반 답변 범위 제한
  - 정중하고 전문적인 톤
  - 마크다운 형식

## 3. 피드백 시스템 프롬프트

**위치**: `app/api/feedback/route.ts`

### 3-1. 심사위원 스타일 피드백
- **라인**: 112-172
- **사용 위치**: 학생 답안에 대한 피드백 생성
- **주요 내용**:
  - 심사위원 역할 정의
  - 평가 루브릭 기준 (있는 경우)
  - 피드백 형식 (2-3개 질문, Q&A 형식)
  - 핵심 검증 포인트

## 4. 피드백 채팅 시스템 프롬프트

**위치**: `app/api/feedback-chat/route.ts`

### 4-1. 심사위원 스타일 피드백 채팅
- **라인**: 114-192
- **사용 위치**: 피드백 채팅 대화
- **주요 내용**:
  - 심사위원 역할 및 정보
  - 평가 루브릭 기준 (있는 경우)
  - 이전 대화 내용 고려
  - HTML/LaTeX 형식 지원
  - 3-5차례 대화 후 마무리

## 5. 요약 생성 시스템 프롬프트

**위치**: `app/api/instructor/generate-summary/route.ts`

### 5-1. 학생 답안 평가 요약
- **라인**: 106
- **사용 위치**: 교수자용 시험 세션 요약 생성
- **주요 내용**:
  - 전문 교육가 AI 역할
  - 답안 상세 분석
  - 강점/약점 파악
  - JSON 형식 응답

## 6. 채점 시스템 프롬프트

**위치**: `lib/grading.ts`, `app/api/session/[sessionId]/grade/route.ts`

### 6-1. 채팅 단계 채점 (Chat Stage Grading)
- **파일**: `lib/grading.ts` (라인 359-378), `app/api/session/[sessionId]/grade/route.ts` (라인 913-928)
- **사용 위치**: 자동 채점 - 채팅 단계 평가
- **주요 내용**:
  - 전문 평가위원 역할
  - 루브릭 기준 평가
  - 학생-AI 대화 과정 평가
  - 0-100점, 루브릭별 0-5점
  - JSON 형식 응답

### 6-2. 답안 단계 채점 (Answer Stage Grading)
- **파일**: `lib/grading.ts` (라인 452-471), `app/api/session/[sessionId]/grade/route.ts` (라인 988-1003)
- **사용 위치**: 자동 채점 - 최종 답안 평가
- **주요 내용**:
  - 전문 평가위원 역할
  - 루브릭 기준 평가
  - 최종 답안 평가
  - 0-100점, 루브릭별 0-5점
  - JSON 형식 응답

### 6-3. 종합 요약 평가 (Summary Evaluation)
- **파일**: `lib/grading.ts` (라인 696-727)
- **사용 위치**: 자동 채점 - 종합 요약 생성
- **주요 내용**:
  - 전문 평가위원 역할
  - 전체 답안 및 채팅 기록 종합 분석
  - 엄격 평가 모드 (이해도 실패 트리거)
  - 감점 상한 규칙
  - 회복 조건
  - JSON 형식 응답 (sentiment, summary, strengths, weaknesses, keyQuotes)

## 통계

- **총 시스템 프롬프트 수**: 약 8-9개 (중복 포함 시 더 많음)
- **파일 분산도**: 
  - `app/api/chat/route.ts`: 2개 함수
  - `app/api/instructor/chat/route.ts`: 1개 함수
  - `app/api/feedback/route.ts`: 1개
  - `app/api/feedback-chat/route.ts`: 1개
  - `app/api/instructor/generate-summary/route.ts`: 1개
  - `lib/grading.ts`: 3개
  - `app/api/session/[sessionId]/grade/route.ts`: 2개 (grading.ts와 중복)

## 문제점

1. **중복**: `lib/grading.ts`와 `app/api/session/[sessionId]/grade/route.ts`에 거의 동일한 프롬프트가 중복
2. **일관성 부족**: 비슷한 목적의 프롬프트가 서로 다른 위치에 분산
3. **유지보수 어려움**: 프롬프트 수정 시 여러 파일을 수정해야 함
4. **테스트 어려움**: 프롬프트 변경 영향 범위 파악이 어려움
