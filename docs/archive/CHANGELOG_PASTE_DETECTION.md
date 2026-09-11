# 부정행위 감지 및 하이라이트 기능 추가 - 변경 이력

## 📅 변경 일자

2025년 12월 23일

## 🎯 주요 목표

1. 학생의 복사-붙여넣기 활동 감지 및 로깅
2. 교수 채점 페이지에서 부정행위 의심 활동 표시
3. 답안에서 복사-붙여넣기한 부분 하이라이트

---

## ✨ 추가된 기능

### 1. 부정행위 의심 로그 시스템

#### 📊 데이터베이스

- **새 테이블**: `paste_logs`
  - 붙여넣기 활동을 추적하는 로그 테이블
  - 컬럼: `id`, `session_id`, `exam_code`, `question_id`, `length`, `pasted_text`, `paste_start`, `paste_end`, `answer_length_before`, `is_internal`, `suspicious`, `timestamp`
  - 파일: `database/create_paste_logs_table.sql`
  - 파일: `database/update_paste_logs_for_highlight.sql` (하이라이트용 추가 컬럼)

#### 🔧 API

- **수정**: `/api/log/paste/route.ts`
  - 붙여넣기 이벤트를 데이터베이스에 저장
  - 저장 정보: 텍스트 내용, 위치, 길이 등

#### 🎨 UI 컴포넌트

- **새 컴포넌트**: `components/instructor/PasteLogsCard.tsx`
  - 부정행위 의심 활동을 카드 형태로 표시
  - 의심 활동 개수, 전체 붙여넣기 횟수 표시
  - 간소화된 디자인

### 2. 답안 작성란 변경 (TipTap → textarea)

#### 🆕 새 컴포넌트

- **생성**: `components/ui/answer-textarea.tsx`
  - 순수 textarea 기반 답안 작성 컴포넌트
  - paste 이벤트에서 정확한 위치 정보 수집
  - `pasteStart`, `pasteEnd`, `pastedText` 등 상세 정보 제공

#### 📝 수정된 파일

- **수정**: `app/exam/[code]/page.tsx`

  - `SimpleRichTextEditor` → `AnswerTextarea`로 교체
  - `handlePaste` 함수를 새로운 인터페이스에 맞게 수정

- **수정**: `app/exam/[code]/answer/page.tsx`
  - `SimpleRichTextEditor` → `AnswerTextarea`로 교체
  - `handlePaste` 함수를 새로운 인터페이스에 맞게 수정

### 3. 채점 페이지 개선

#### 📊 API 수정

- **수정**: `/api/session/[sessionId]/grade/route.ts`
  - `paste_logs` 조회 시 새로운 필드 포함
  - `pasted_text`, `paste_start`, `paste_end`, `answer_length_before` 조회

#### 🎨 UI 개선

- **수정**: `app/instructor/[examId]/grade/[studentId]/page.tsx`

  - `PasteLogsCard`를 `GradeHeader` 옆에 배치 (flex 레이아웃)
  - 부정행위 의심 카드가 더 넓은 공간 차지

- **수정**: `components/instructor/FinalAnswerCard.tsx`
  - 답안에서 복사-붙여넣기한 부분 하이라이트 기능 추가
  - 의심스러운 붙여넣기 부분을 빨간색으로 표시
  - 경고 배지 및 상세 정보 표시

### 4. 데이터베이스 함수 추가

#### 🔧 RPC 함수

- **생성**: `database/create_increment_used_clarifications_function.sql`
  - `increment_used_clarifications` 함수 생성
  - 경쟁 상태 방지를 위한 원자적 업데이트
  - `used_clarifications` 카운트 증가

### 5. 유틸리티 스크립트

#### 📊 조회 스크립트

- **생성**: `scripts/query-students-by-exam-code.ts`

  - Prisma를 사용하여 시험 코드로 학생 목록 조회
  - 학생별 상세 정보 및 통계 제공

- **생성**: `scripts/delete-student-sessions.ts`
  - 특정 학생의 시험 세션 삭제 스크립트
  - 관련 데이터(메시지, 제출물, 점수) 자동 삭제

#### 📝 SQL 쿼리

- **생성**: `database/query_students_by_exam_code.sql`
  - 시험 코드로 학생 목록 조회하는 SQL 쿼리
  - 여러 가지 조회 방법 제공

### 6. 문서화

#### 📚 문서 파일

- **생성**: `docs/PASTE_HIGHLIGHT_DATA_COLLECTION.md`

  - 하이라이트 기능을 위한 데이터 수집 방안
  - 구현 방법 및 우선순위 제시

- **생성**: `docs/PASTE_HIGHLIGHT_COMPARISON.md`
  - TipTap vs textarea 비교 분석
  - 각각의 장단점 및 구현 복잡도 비교

---

## 🔄 변경된 파일 목록

### 새로 생성된 파일

1. `components/ui/answer-textarea.tsx` - textarea 기반 답안 작성 컴포넌트
2. `components/instructor/PasteLogsCard.tsx` - 부정행위 의심 카드
3. `database/create_paste_logs_table.sql` - paste_logs 테이블 생성
4. `database/update_paste_logs_for_highlight.sql` - 하이라이트용 컬럼 추가
5. `database/create_increment_used_clarifications_function.sql` - RPC 함수 생성
6. `scripts/query-students-by-exam-code.ts` - 학생 조회 스크립트
7. `scripts/delete-student-sessions.ts` - 세션 삭제 스크립트
8. `database/query_students_by_exam_code.sql` - 학생 조회 SQL
9. `docs/PASTE_HIGHLIGHT_DATA_COLLECTION.md` - 데이터 수집 방안 문서
10. `docs/PASTE_HIGHLIGHT_COMPARISON.md` - 에디터 비교 문서

### 수정된 파일

1. `app/exam/[code]/page.tsx` - SimpleRichTextEditor → AnswerTextarea 교체
2. `app/exam/[code]/answer/page.tsx` - SimpleRichTextEditor → AnswerTextarea 교체
3. `app/api/log/paste/route.ts` - 추가 정보 저장 (텍스트, 위치)
4. `app/api/session/[sessionId]/grade/route.ts` - paste_logs 조회 시 새 필드 포함
5. `app/instructor/[examId]/grade/[studentId]/page.tsx` - PasteLogsCard 추가 및 레이아웃 변경
6. `components/instructor/FinalAnswerCard.tsx` - 하이라이트 기능 추가
7. `components/instructor/GradeHeader.tsx` - 마진 조정

---

## 🎨 UI/UX 변경사항

### 채점 페이지 레이아웃

- **이전**: GradeHeader가 전체 너비 차지
- **변경**: GradeHeader와 PasteLogsCard가 나란히 배치 (flex 레이아웃)
  - GradeHeader: 필요한 만큼만 차지
  - PasteLogsCard: 나머지 공간 모두 차지

### 부정행위 의심 카드

- **위치**: 채점 페이지 상단, GradeHeader 옆
- **디자인**: 간소화된 컴팩트 디자인
- **정보**: 전체 붙여넣기 횟수, 의심 활동 횟수만 표시

### 답안 하이라이트

- **표시 방식**: 복사-붙여넣기한 부분을 빨간색 배경으로 하이라이트
- **경고 배지**: 답안 카드 헤더에 "외부 붙여넣기 N건" 배지 표시
- **상세 정보**: 각 붙여넣기의 길이와 시간 표시

---

## 🔧 기술적 개선사항

### 1. 에디터 변경

- **이전**: TipTap (ProseMirror 기반) - HTML 구조
- **변경**: 순수 textarea - 텍스트 기반
- **장점**:
  - paste 위치 추적이 매우 간단해짐
  - 하이라이트 구현이 쉬워짐
  - 정확도 향상

### 2. 데이터 수집 개선

- **이전**: `length`, `timestamp`만 저장
- **변경**: `pasted_text`, `paste_start`, `paste_end`, `answer_length_before` 추가 저장
- **효과**: 답안에서 정확한 위치 하이라이트 가능

### 3. 성능 최적화

- `increment_used_clarifications` RPC 함수로 경쟁 상태 방지
- 원자적 업데이트로 동시성 문제 해결

---

## 📋 데이터베이스 마이그레이션 필요

다음 SQL 스크립트를 Supabase에서 실행해야 합니다:

1. **paste_logs 테이블 생성**

   ```sql
   -- database/create_paste_logs_table.sql 실행
   ```

2. **하이라이트용 컬럼 추가**

   ```sql
   -- database/update_paste_logs_for_highlight.sql 실행
   ```

3. **RPC 함수 생성**
   ```sql
   -- database/create_increment_used_clarifications_function.sql 실행
   ```

---

## 🧪 테스트 방법

### 1. 부정행위 감지 테스트

1. 시험 응시 페이지 접속
2. 외부에서 텍스트 복사 (예: 웹페이지, 문서)
3. 답안 작성란에 붙여넣기
4. 채점 페이지에서 부정행위 의심 카드 확인

### 2. 하이라이트 테스트

1. 여러 곳에서 텍스트를 복사하여 붙여넣기
2. 시험 제출
3. 채점 페이지에서 답안 확인
4. 붙여넣기한 부분이 빨간색으로 하이라이트되는지 확인

### 3. 학생 조회 테스트

```bash
npx tsx scripts/query-students-by-exam-code.ts P5AD7X
```

---

## ⚠️ 주의사항

1. **데이터베이스 마이그레이션 필수**: 새 기능을 사용하려면 SQL 스크립트 실행 필요
2. **기존 데이터**: 기존 답안은 HTML 형식일 수 있음 (하위 호환성 유지)
3. **내부 복사 감지**: 현재는 모든 붙여넣기를 외부로 간주 (향후 개선 가능)

---

## 🚀 향후 개선 가능 사항

1. 내부 복사 감지 로직 추가
2. 하이라이트 정확도 향상 (HTML 답안 처리)
3. 부정행위 의심 활동 통계 대시보드
4. 실시간 모니터링 기능
