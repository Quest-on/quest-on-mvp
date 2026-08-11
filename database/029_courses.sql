-- 029: 코스(교과목) 엔티티 추가
--
-- 이 마이그레이션은 전부 "추가 전용"이다. 기존 컬럼 변경·삭제 없음.
-- exams.course_id는 nullable이므로 기존 시험이 코스 없이도 동작한다.
-- 새로운 시험은 course_id를 지정할 수 있지만 필수가 아니다.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. courses: 교과목 그룹화
-- ─────────────────────────────────────────────────────────────
-- 교수자가 한 학기에 서로 다른 교과목을 여러 개 진행할 수 있으므로,
-- 시험 레벨의 설정(예: 채점 기준)을 교과목별로 분리하기 위해 도입한다.
-- instructor_id로만 소유권을 정의하고, 공동 소유/멤버십 테이블은 추가하지 않는다.
-- term은 자유 텍스트(예: "2026-1", "fall 2026")로서 열거형으로 모델링하지 않는다.
CREATE TABLE IF NOT EXISTS public.courses (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id text        NOT NULL,
  name          text        NOT NULL,
  term          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courses_instructor_id
  ON public.courses (instructor_id);

-- ─────────────────────────────────────────────────────────────
-- 2. exams: course_id 참조 추가
-- ─────────────────────────────────────────────────────────────
-- course_id는 nullable이므로 기존 시험은 코스 없이도 계속 동작한다.
-- 새 시험은 course_id를 지정할 수 있다 (필수 아님).
-- ON DELETE SET NULL로 코스 삭제 시에도 시험은 보존된다.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exams_course_id
  ON public.exams (course_id);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS: courses 테이블 보안
-- ─────────────────────────────────────────────────────────────
-- 교수자만 자신의 코스를 관리할 수 있도록 service_role 전용으로 제한한다.
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.courses FROM anon, authenticated;

DROP POLICY IF EXISTS "service_role_all" ON public.courses;
CREATE POLICY "service_role_all" ON public.courses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.courses TO service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백
-- ─────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_exams_course_id;
-- ALTER TABLE public.exams DROP COLUMN IF EXISTS course_id;
-- DROP INDEX IF EXISTS idx_courses_instructor_id;
-- DROP TABLE IF EXISTS public.courses;
