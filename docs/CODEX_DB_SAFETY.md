# Codex Database Safety

이 규칙은 모든 로컬 작업과 검증에 구속력이 있다.

- Supabase, Prisma, Playwright E2E·API 테스트, seed·cleanup 헬퍼, Docker DB 컨테이너, `psql`, 마이그레이션을 건드리는 명령 전에는 이 문서를 읽는다.
- DB 백엔드 테스트와 `e2e/helpers/seed.ts::cleanupTestData()` 는 사용자가 **폐기 가능한 로컬 DB**를 명시 확인하고, 정확한 DB URL이 `localhost` 또는 `127.0.0.1`일 때만 실행한다.
- 테스트·검증 명령에 `.env.local`을 절대 로드하지 않는다. `.env.test`가 없거나 DB URL이 localhost가 아니면 멈추고 사용자에게 묻는다.
- 사용자가 데이터 손실 또는 DB 손상을 보고하면 모든 DB 관련 명령을 즉시 중단한다. 사용자가 다음 단계를 명시 승인할 때까지 로컬 파일과 Git 기록만 조사한다.
