-- 041: exams.student_materials, exams.material_names — 교수 자료 중 학생에게 공개한 파일과 원래 이름 (이슈 #544)
--
-- 교수자가 올린 자료(exams.materials, 공개 URL 문자열 배열)는 #508 뒤로 학생 응답에서 빠진다.
-- 교수자가 파일마다 학생 공개를 켜면, 그 URL 을 student_materials 에 담고 학생 응시 화면이 공개한
-- 파일만 내려받게 한다. 같은 목록을 AI 코드 실행이 데이터 파일을 고를 때도 읽는다
-- (lib/student-materials.ts 의 getStudentVisibleMaterials).
--
-- 업로드 경로는 Storage 객체 키를 <날짜>_<uuid>.<확장자> 로 만들어 원래 파일 이름이 URL 에 없다.
-- 학생이 "2026-10-03_<uuid>.xlsx" 를 받지 않도록 원래 이름을 material_names 에 따로 둔다.
--
-- 모양:
--   student_materials  URL 문자열의 JSON 배열. 항상 exams.materials 의 부분집합이고 순서는 materials 순서.
--   material_names     JSON 객체. 키는 자료 URL(항상 exams.materials 안의 값), 값은 원래 파일 이름 문자열
--                      (제어문자와 경로 구분자를 지우고 200자로 자른 값).
--   부분집합, 순서, 키 제한, 이름 정규화는 앱이 저장할 때 맞춘다(createExam, updateExam, copyExam, 시드
--   스크립트). DB 는 배열과 객체인지만 검사한다. 읽는 쪽은 교집합만 쓰므로 불변식이 깨져도 지운 파일은
--   나가지 않고, 이름이 없는 자료는 URL 의 마지막 조각을 이름으로 쓴다.
-- 기본값 [] 와 {}: 기존 시험과 이 컬럼을 모르는 저장은 아무것도 공개하지 않고(개인정보와 보안 기본값),
--   이름은 지금처럼 URL 조각으로 보인다.
--
-- ⚠️ 반드시 코드보다 먼저 적용할 것 (database/018 헤더와 같은 선적용 규칙).
--   스테이징 Supabase 에 먼저 적용 → staging 배포에서 교수자 생성, 수정, 학생 입장 QA →
--   staging → main 머지 직전에 운영 Supabase 에 적용. 이 컬럼이 없는 DB 에 코드가 먼저 나가면
--   학생 입장 조회(init_exam_session)가 없는 컬럼을 select 해 실패하고 학생이 시험에 들어가지
--   못한다. 교수자 수정 화면 열기와 저장, 시험 생성, 복사도 함께 실패한다. 반대로 이 SQL 만
--   먼저 적용하는 것은 해롭지 않다(기존 코드는 이 컬럼들을 읽지도 쓰지도 않는다).
--
-- 안전장치:
--   - 추가 전용. 기존 컬럼과 행을 바꾸거나 지우지 않는다.
--   - ADD COLUMN IF NOT EXISTS 와 상수 DEFAULT 라 PostgreSQL 11 이상에서는 테이블을 다시 쓰지
--     않는다(메타데이터만 바뀐다). 기존 행은 모두 [] 와 {} 로 읽힌다.
--   - CHECK 제약 두 개는 이름(exams_student_materials_is_array, exams_material_names_is_object)으로
--     존재를 확인하고 없을 때만 더한다. 더할 때 기존 행을 한 번 검사한다. 모든 행이 기본값이라 실패하지 않는다.
--   - 멱등: 여러 번 실행해도 결과가 같다.
--   - SET LOCAL lock_timeout = 5s: 잠금을 5초 안에 못 얻으면 실패한다(트랜잭션 안에서만).
--   - COMMIT 뒤 NOTIFY pgrst 로 PostgREST 스키마 캐시를 바로 갱신한다.
 CI 의 테스트 DB 처럼 prisma db push 가 컬럼을 먼저
--     만든 DB 에서도 컬럼 추가는 건너뛰고 제약만 더한다.
--
-- 확인 쿼리 (적용 후):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'exams'
--      and column_name in ('student_materials', 'material_names')
--    order by column_name;
--   기대: material_names jsonb NO '{}'::jsonb / student_materials jsonb NO '[]'::jsonb (두 행)
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.exams'::regclass
--      and conname in ('exams_student_materials_is_array', 'exams_material_names_is_object')
--    order by conname;
--   기대: CHECK ((jsonb_typeof(material_names) = 'object'::text)),
--         CHECK ((jsonb_typeof(student_materials) = 'array'::text)) 두 행
--   select count(*) from public.exams
--    where student_materials <> '[]'::jsonb or material_names <> '{}'::jsonb;
--   기대: 적용 직후 0
--   앱 쪽 확인: GET /api/health 의 checks.schema.missingColumns 에 exams.student_materials,
--   exams.material_names 가 없어야 한다.

BEGIN;

-- ADD COLUMN 와 ADD CONSTRAINT 는 ACCESS EXCLUSIVE 잠금을 잡는다. 오래 걸리는 트랜잭션이 exams 를
-- 잡고 있으면 뒤따르는 학생 입장 조회가 모두 줄을 선다. 5초 안에 잠금을 못 얻으면 실패하는 편이
-- 응시 화면 전체를 멈추는 것보다 낫다(재적용하면 된다 - 멱등). SET LOCAL 이라 이 트랜잭션에만 적용된다.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS student_materials jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS material_names jsonb NOT NULL DEFAULT '{}'::jsonb;

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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.exams'::regclass
      AND conname = 'exams_material_names_is_object'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_material_names_is_object
      CHECK (jsonb_typeof(material_names) = 'object');
  END IF;
END
$$;

COMMIT;

-- PostgREST 스키마 캐시를 바로 갱신한다. 이 NOTIFY 가 없으면 새 컬럼 select 가 몇 초간
-- 실패한다(schema cache 미스). CI 의 테스트 DB 셋업도 같은 NOTIFY 로 끝낸다.
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- 롤백 (롤백 프로시저 검토 후 수동 실행)
-- ─────────────────────────────────────────────────────────────
-- 코드를 먼저 되돌린다. 코드가 남아 있는 채로 컬럼을 지우면 학생 입장이 실패한다.
-- 컬럼을 지우면 교수자가 정한 공개 설정과 원래 파일 이름이 사라진다. 올린 파일(Storage 객체)과
-- exams.materials 는 그대로다.
--
-- ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_material_names_is_object;
-- ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_student_materials_is_array;
-- ALTER TABLE public.exams DROP COLUMN IF EXISTS material_names;
-- ALTER TABLE public.exams DROP COLUMN IF EXISTS student_materials;
