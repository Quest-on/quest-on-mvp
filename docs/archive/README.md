# 보관 문서

**여기 있는 문서는 전부 작성 시점의 스냅샷이다. 현재 동작의 근거로 쓰지 않는다.**

한때 저장소 루트에 있던 분석·구현 리포트다. 대부분 2025년~2026년 초에 쓰였고 이후 코드가 크게 바뀌었다. 특히 다음이 이미 사실과 다르다.

- 인증은 Clerk 이 아니라 **Supabase Auth** 다. (`SETUP.md`, `ERROR_RESOLUTION_GUIDE.md`, `STORAGE_RLS_FIX_GUIDE.md`)
- 페이지 경로가 `app/instructor/...` → `app/(app)/instructor/...` 로 옮겨졌다.
- AI 모델은 gpt-5.6 계열이다.
- `mermaid/` 는 Clerk 시절 as-is/to-be 마이그레이션 검토용 도식이다. 현재 구조 도식은 루트 `ARCHITECTURE.md` 안에 Mermaid 로 들어 있다.

루트를 비운 이유는 사람이 아니라 **에이전트** 때문이다. Claude Code / Cursor / Codex 는 루트의 마크다운을 컨텍스트로 끌어간다. 틀린 문서가 루트에 있으면 모든 도구가 같이 틀린다.

현재 유효한 문서는 루트의 `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `PRODUCT_PHILOSOPHY.md` 와 `docs/` 아래에 있다.

여기 있는 내용이 지금도 맞다면 해당 문서를 `docs/` 로 되살리면서 코드 기준으로 다시 검증한다. 그냥 옮기지 않는다.
