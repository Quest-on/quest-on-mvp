# 시험 생성 오류 해결 가이드

## 발생한 오류들

1. **Row-level security policy 위반**: `new row violates row-level security policy`
2. **instructions 컬럼 없음**: `Could not find the 'instructions' column of 'exams' in the schema cache`

## 해결 방법

### 1단계: 데이터베이스 스키마 업데이트

다음 SQL 스크립트를 Supabase SQL Editor에서 실행하세요:

```sql
-- rubric과 instructions 컬럼 추가
ALTER TABLE public.exams
ADD COLUMN rubric jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.exams
ADD COLUMN instructions text DEFAULT '';

-- 인덱스 생성
CREATE INDEX idx_exams_rubric ON public.exams USING gin (rubric);

-- 컬럼 확인
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'exams' AND column_name IN ('rubric', 'instructions');
```

### 2단계: RLS 정책 설정 (옵션 A - 권장)

Clerk와 호환되는 RLS 정책을 설정:

```sql
-- RLS 활성화
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Instructors can create exams" ON public.exams;
DROP POLICY IF EXISTS "Instructors can view their own exams" ON public.exams;
DROP POLICY IF EXISTS "Instructors can update their own exams" ON public.exams;
DROP POLICY IF EXISTS "Instructors can delete their own exams" ON public.exams;
DROP POLICY IF EXISTS "Students can view active exams" ON public.exams;

-- 새로운 정책 생성
CREATE POLICY "Instructors can create exams" ON public.exams
    FOR INSERT WITH CHECK (instructor_id IS NOT NULL);

CREATE POLICY "Instructors can view their own exams" ON public.exams
    FOR SELECT USING (instructor_id IS NOT NULL);

CREATE POLICY "Instructors can update their own exams" ON public.exams
    FOR UPDATE USING (instructor_id IS NOT NULL);

CREATE POLICY "Instructors can delete their own exams" ON public.exams
    FOR DELETE USING (instructor_id IS NOT NULL);

CREATE POLICY "Students can view active exams" ON public.exams
    FOR SELECT USING (status = 'active');
```

### 2단계: RLS 정책 설정 (옵션 B - 임시 해결)

개발 중이라면 임시로 RLS를 비활성화:

```sql
-- RLS 비활성화 (개발용)
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
```

## 테스트

스키마 업데이트 후 다음을 확인하세요:

1. **시험 생성 페이지**에서 새 시험 생성 시도
2. **루브릭 설정**이 정상적으로 저장되는지 확인
3. **AI 피드백**이 루브릭 기준을 반영하는지 확인

## 추가 고려사항

### 보안 강화 (프로덕션 환경)

프로덕션 환경에서는 더 엄격한 RLS 정책을 사용하는 것을 권장합니다:

```sql
-- 더 엄격한 정책 (프로덕션용)
CREATE POLICY "Instructors can create exams" ON public.exams
    FOR INSERT WITH CHECK (
        instructor_id IS NOT NULL
        AND length(instructor_id) > 0
    );

CREATE POLICY "Instructors can view their own exams" ON public.exams
    FOR SELECT USING (
        instructor_id IS NOT NULL
        AND length(instructor_id) > 0
    );
```

### Clerk-Supabase 연동 (장기적 해결책)

향후 Clerk 사용자 ID를 Supabase auth와 연동하는 방법을 고려할 수 있습니다:

1. Clerk webhook을 사용하여 사용자 생성/업데이트 시 Supabase auth에도 동기화
2. JWT 토큰을 통한 인증 연동
3. 커스텀 인증 함수 구현

## 파일 위치

생성된 마이그레이션 스크립트들:

- `database/add_rubric_column.sql` - rubric과 instructions 컬럼 추가
- `database/setup_exams_rls_policies_clerk.sql` - Clerk 호환 RLS 정책
- `database/disable_exams_rls.sql` - RLS 비활성화 (개발용)

## 문제가 지속되는 경우

1. Supabase 대시보드에서 테이블 스키마 확인
2. RLS 정책 상태 확인
3. Clerk 사용자 메타데이터에서 role 필드 확인
4. 브라우저 개발자 도구에서 네트워크 요청 확인
