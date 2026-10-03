-- 040: exams.student_materials — 교수 자료 중 학생에게 공개한 파일 (이슈 #544)
--
-- 교수자가 올린 자료(exams.materials, 공개 URL 문자열 배열)는 #508 뒤로 학생 응답에서 빠진다.
-- 교수자가 파일마다 학생 공개를 켜면, 그 URL 을 이 컬럼에 담고 학생 응시 화면이 공개한 파일만
-- 내려받게 한다. 같은 목록을 AI 코드 실행이 데이터 파일을 고를 때도 읽는다
-- (lib/student-materials.ts 의 getStudentVisibleMaterials).
--
-- 모양: URL 문자열의 JSON 배열. 항상 exams.materials 의 부분집합이고 순서는 materials 순서를
--   따른다. 부분집합과 순서는 앱이 저장할 때 맞춘다(createExam, updateExam, copyExam, 시드 스크립트).
--   DB 는 배열인지만 검사한다. 읽는 쪽은 교집합만 쓰므로 불변식이 깨져도 지운 파일은 나가지 않는다.
-- 기본값 []: 기존 시험과 이 컬럼을 모르는 저장은 아무것도 공개하지 않는다(개인정보와 보안 기본값).
--
-- ⚠️ 반드시 코드보다 먼저 적용할 것 (database/018 헤더와 같은 선적용 규칙).
--   스테이징 Supabase 에 먼저 적용 → staging 배포에서 교수자 생성, 수정, 학생 입장 QA →
--   staging → main 머지 직전에 운영 Supabase 에 적용. 이 컬럼이 없는 DB 에 코드가 먼저 나가면
--   학생 입장 조회(init_exam_session)가 없는 컬럼을 select 해 실패하고 학생이 시험에 들어가지
--   못한다. 교수자 수정 화면 열기와 저장, 시험 생성, 복사도 함께 실패한다. 반대로 이 SQL 만
--   먼저 적용하는 것은 해롭지 않다(기존 코드는 이 컬럼을 읽지도 쓰지도 않는다).
--
-- 안전장치:
--   - 추가 전용. 기존 컬럼과 행을 바꾸거나 지우지 않는다.
--   - ADD COLUMN IF NOT EXISTS 와 상수 DEFAULT 라 PostgreSQL 11 이상에서는 테이블을 다시 쓰지
--     않는다(메타데이터만 바뀐다). 기존 행은 모두 [] 로 읽힌다.
--   - CHECK 제약은 이름(exams_student_materials_is_array)으로 존재를 확인하고 없을 때만 더한다.
--     제약을 더할 때 기존 행을 한 번 검사한다. 모든 행이 [] 라 실패하지 않는다.
--   - 멱등: 여러 번 실행해도 결과가 같다. CI 의 테스트 DB 처럼 prisma db push 가 컬럼을 먼저
--     만든 DB 에서도 컬럼 추가는 건너뛰고 제약만 더한다.
--
-- 확인 쿼리 (적용 후):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'exams' and column_name = 'student_materials';
--   기대: jsonb, NO, '[]'::jsonb
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.exams'::regclass and conname = 'exams_student_materials_is_array';
--   기대: CHECK ((jsonb_typeof(student_materials) = 'array'::text)) 한 행
--   select count(*) from public.exams where student_materials <> '[]'::jsonb;
--   기대: 적용 직후 0
--   앱 쪽 확인: GET /api/health 의 checks.schema.missingColumns 에 exams.student_materials 가 없어야 한다.

BEGIN;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS student_materials jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.exams'::regclass
      AND conname = 'exams_student_materials_is_array'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_student_materials_is_array
      CHECK (jsonb_typeof(student_materials) = 'array');
  END IF;
END
$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 (롤백 프로시저 검토 후 수동 실행)
-- ─────────────────────────────────────────────────────────────
-- 코드를 먼저 되돌린다. 코드가 남아 있는 채로 컬럼을 지우면 학생 입장이 실패한다.
-- 컬럼을 지우면 교수자가 정한 공개 설정이 사라진다. 올린 파일(Storage 객체)과 exams.materials 는
-- 그대로다.
--
-- ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_student_materials_is_array;
-- ALTER TABLE public.exams DROP COLUMN IF EXISTS student_materials;
