# marketing/

Quest-On 마케팅, 세일즈, 영상 자료를 한곳에 모은 디렉터리. 앱 빌드와 무관한 자료만 둔다.

## 구조

| 경로 | 내용 |
|------|------|
| `linkedin/PLAYBOOK.md` | 한국 링크드인 바이럴 플레이북(에버그린). 매주 새 글 쓰기 전에 먼저 읽는다. |
| `linkedin/posts/` | 주차별 발행본(3종: 회사 한국어, 첫 댓글 영문, 개인 리포스트) + 사진/운영 노트. 파일명은 `YYYY-MM-DD-주제.md`. |
| `dongguk-guide/` | 동국대 도입 안내 덱(HTML/PDF/PPTX + 슬라이드 PNG). |
| `mba-guide/` | MBA 교수용 안내 덱(HTML/PDF + 슬라이드 PNG). |
| `decks/` | 범용 소개/피칭 자료(`presentation.html`). |
| `guides/` | 학생 사용 가이드(HTML, PPT 원고, 한/영 PDF/PPTX). |
| `sales/` | 세일즈 문서(사용의사확인서 등). |
| `responses/` | 응시/사건 대응 샘플 문서(교수 응답, 학생 응답, 인시던트 리포트). |
| `video/` | 영상 소스 서브프로젝트. 각자 자체 `package.json`을 가진 독립 프로젝트다. |

## video/ 서브프로젝트

| 경로 | 종류 | 비고 |
|------|------|------|
| `video/remotion/` | Remotion(React) | `node_modules`, `out`, `public`은 gitignore. |
| `video/demo-video/` | HyperFrames(HTML) | `renders`, `assets`, `fonts`는 gitignore. |
| `video/quest-on-why-hyperframes/` | HyperFrames(HTML) | |

영상 프로젝트의 의존성 설치와 렌더는 각 디렉터리 안에서 실행한다. 루트 `package.json`과 분리되어 있다.

## 참고

`student-exam-guide.html`을 캡처하는 `scripts/screenshot-guide.mjs`는 이동된 경로(`marketing/guides/`)를 가리키도록 갱신되어 있다. `public/bi-concepts.html`은 `/bi-concepts.html`로 서빙되는 자산이라 `public/`에 그대로 둔다.
