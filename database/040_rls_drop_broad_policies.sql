-- 040: 소유자 확인 없이 roles=public 에 열려 있던 RLS 정책을 제거한다
--
-- 이 정책들은 조건이 `instructor_id IS NOT NULL` 처럼 행에 값이 있기만 하면 통과하는
-- 수준이고 대상 역할이 public 이라, 미인증(anon) 요청이 WHERE 절을 붙이지 않은
-- 변경(DELETE/UPDATE)을 시도할 때 RLS 가 행을 보호하지 못한다. 소유자 기준 정책
-- (clerk_user_id() 비교)은 그대로 두므로 앱의 교수자 경로는 영향을 받지 않는다.
--
-- 이 테이블들을 읽고 쓰는 앱 코드는 전부 서버의 서비스 키 클라이언트
-- (lib/supabase-server.ts, RLS 미적용)를 쓰고, 브라우저 Supabase 클라이언트는
-- 직접 건드리지 않는다(2026-10-03 저장소 전수 확인). 따라서 제거해도 기능이
-- 바뀌지 않는다.
--
-- ⚠️ 적용 순서: 코드와 무관하게 단독으로 적용할 수 있다. 스테이징 적용 후
-- 앱 스모크(학생 입장, 비로그인 get_exam, 교수 화면)를 돌리고 운영에 적용한다.
--
-- 안전장치:
--   - DROP POLICY IF EXISTS 로 멱등이다. 이미 없으면 0건으로 끝난다.
--   - 대상은 아래 나열한 정책 이름뿐이다. 다른 정책은 건드리지 않는다.
--   - SET LOCAL lock_timeout 으로 잠금 대기를 제한한다.
--
-- 확인 쿼리 (적용 후):
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public'
--     and roles::text like '%public%'
--     and coalesce(qual, '') || coalesce(with_check, '') !~* '(auth\.uid|auth\.jwt|clerk_user_id|is_admin)'
--   order by 1;
--   -> 남는 것은 의도된 공개 읽기 두 개뿐이어야 한다
--      (blog_posts 공개 읽기, exams "Students can view active exams").
--
-- ─────────────────────────────────────────────────────────────
-- 롤백 (필요 시 수동 실행)
-- ─────────────────────────────────────────────────────────────
-- 되살리는 것을 권장하지 않는다. 구문이 필요하면 git history 의 이 커밋 이전
-- 상태(정책 생성 마이그레이션)를 참고해 소유자 조건을 붙여 재생성한다.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- exams: 조건이 instructor_id IS NOT NULL 뿐인 네 정책.
-- 소유자 기준(instructors_*_own_exams)과 학생용(students_select_enrolled_exams)은 유지.
DROP POLICY IF EXISTS "Instructors can view their own exams" ON public.exams;
DROP POLICY IF EXISTS "Instructors can update their own exams" ON public.exams;
DROP POLICY IF EXISTS "Instructors can delete their own exams" ON public.exams;
DROP POLICY IF EXISTS "Instructors can create exams" ON public.exams;

-- exam_nodes: 같은 패턴의 네 정책. 소유자 기준(instructors_*_own_nodes)은 유지.
DROP POLICY IF EXISTS "Instructors can view their own nodes" ON public.exam_nodes;
DROP POLICY IF EXISTS "Instructors can update their own nodes" ON public.exam_nodes;
DROP POLICY IF EXISTS "Instructors can delete their own nodes" ON public.exam_nodes;
DROP POLICY IF EXISTS "Instructors can insert their own nodes" ON public.exam_nodes;

-- 그 밖: roles=public 인 전체 허용 정책들. 해당 테이블은 서버 전용이다.
DROP POLICY IF EXISTS "Service role full access for blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Allow read for service role" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_all" ON public.grading_chats;
DROP POLICY IF EXISTS "service_role_all_exam_grading_sessions" ON public.exam_grading_sessions;
DROP POLICY IF EXISTS "service_role_all_bulk_grading_messages" ON public.bulk_grading_messages;

COMMIT;
