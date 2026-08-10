# 기여 가이드 (Quest-On)

이 문서는 **개발이 처음인 팀원**도 그대로 따라 할 수 있게 쓰였습니다.
저장소는 `Quest-on/quest-on-mvp` 이고, 팀원은 **이 저장소에 직접 브랜치를 만들어** 작업합니다. 포크는 필요 없습니다.

---

## 한 장 요약

```
Quest-on/quest-on-mvp
      │
      ① staging 에서 브랜치 만들어 작업
      │
      ② 같은 저장소로 push
      │
      ③ base=staging 으로 Pull Request  →  CI 통과  →  Squash 머지
      │
      ④ staging.quest-on.app 에서 팀 QA
      │
      ⑤ staging → main 승격 PR  →  메인테이너 승인 1개  →  프로덕션 배포
```

- **`main` 은 GitHub ruleset 이 막습니다.** PR + 승인 1개 + CI 초록이 필요합니다. (조직 관리자는 장애 대응을 위해 우회할 수 있지만, 평시에 쓰라고 있는 게 아닙니다.)
- **`staging` 에는 서버 측 protection 이 없습니다.** 장애 시 손이 묶이지 않게 일부러 비워 뒀습니다. 그래도 **작업은 반드시 PR 로 올립니다** — 로컬 git hook 이 실수로 인한 직접 커밋을 막습니다.
- **작업 1개 = 이슈 1개 = 브랜치 1개 = PR 1개.** 작게, 자주.
- **force-push 는 내 작업 브랜치에서만.** 공용 브랜치엔 절대 금지.

---

## ⚠️ 시작 전 가장 중요한 경고 — 데이터베이스

이 프로젝트의 로컬 환경(`.env.local`)은 **실제 운영 데이터베이스를 가리킬 수 있습니다.**
설정을 잘못하면 **로컬에서 앱을 돌리는 것만으로 실제 사용자 데이터가 바뀝니다.**

- 반드시 메인테이너에게 **본인용 개발 DB 접속 정보**를 받아서 쓰세요.
- 운영 DB 접속 정보를 본인 `.env.local` 에 넣지 마세요.
- `.env`, `.env.local` 은 **절대 커밋하지 마세요.** (이미 gitignore 처리됨)
- 헷갈리면 멈추고 물어보세요. 지우는 것보다 안 건드리는 게 낫습니다.

---

## 처음 한 번만 하는 세팅

> CLI 가 어렵다면 **GitHub Desktop** 이나 **VS Code 의 Git 화면**을 써도 됩니다.

1. 저장소 클론 (포크하지 않습니다):
   ```bash
   git clone https://github.com/Quest-on/quest-on-mvp.git
   cd quest-on-mvp
   ```
2. 의존성 설치:
   ```bash
   npm install
   ```
   > `npm install` 시 **안전장치(git hook)가 자동 설치**됩니다. 이후 `main` 이나 `staging` 에 실수로 커밋·push 하려 하면 git 이 막고 작업 브랜치로 안내합니다.
3. 메인테이너에게 받은 **개발용 환경변수**를 `.env.local` 에 넣고 확인:
   ```bash
   npm run env:check
   ```

접근 권한(collaborator 초대)이 없으면 클론만 되고 push 가 막힙니다. 메인테이너에게 초대를 요청하세요.

---

## 작업할 때마다 반복하는 흐름

> 브랜치는 2단계입니다. 작업 PR 은 전부 `staging` 으로 올리고, 스테이징(staging.quest-on.app)에서 QA 를 통과한 것만 `staging` → `main` 승격 PR 로 프로덕션에 나갑니다. 환경 설명은 `docs/STAGING.md`.

### 0) 이슈 확인
`status:ready` 인 이슈를 하나 잡고 `status:in-progress` 로 옮깁니다. 이슈 없이 가야 하는 예외는 PR 본문에 `No issue: <이유>` 를 적습니다. 규칙은 `docs/WORKFLOW.md`.

### 1) 최신 staging 받아오기 (작업 시작 전 항상)
```bash
git fetch origin
git checkout -B staging origin/staging
```

### 2) 작업용 브랜치 만들기
브랜치 이름 규칙: `<종류>/<짧은-설명>`
```bash
git checkout -b feat/login-button origin/staging
```
| 종류 | 언제 |
|------|------|
| `feat/` | 새 기능 |
| `fix/`  | 버그 수정 |
| `docs/` | 문서만 |
| `chore/`| 설정·잡일 |

### 3) 작업 → 검증 → 커밋
푸시 전에 반드시 돌립니다.
```bash
npx tsc --noEmit && npm run lint
npx vitest run <바꾼 것과 관련된 파일>
```
```bash
git add -A
git commit -m "feat: 로그인 버튼 추가"
```
- 커밋 메시지는 **무엇을 했는지** 한 줄로. (한국어 OK)
- 커밋에 `Co-Authored-By` 줄은 넣지 않습니다.

### 4) push
```bash
git push -u origin feat/login-button
```

### 5) Pull Request 열기
- base(받는 쪽)는 **`staging`**, compare(주는 쪽)는 내 브랜치.
- 템플릿을 그대로 채웁니다. **`Closes #<번호>` 를 비워 두면 `pr-hygiene` 이 PR 을 막습니다.**
- **검증 증거 칸에 실제 명령 출력을 붙입니다.** "확인했습니다" 는 증거가 아닙니다.
- 진행 중이면 **Draft PR** 로 먼저 열어도 됩니다.

### 6) 리뷰 반영
- 코멘트가 달리면 같은 브랜치에서 수정 후 다시 push 하면 PR 이 자동 갱신됩니다.
- CI(Lint & Type Check, Build, Unit Tests, API Integration Tests, Browser E2E Tests, impact-review, pr-hygiene)가 **전부 초록**이어야 머지합니다.
- `staging` PR 은 CI 초록이면 승인 없이 머지할 수 있습니다. `main` 승격 PR 은 **승인 1개**가 필요합니다.

### 7) QA
`staging` 에 머지되면 자동으로 staging.quest-on.app 에 배포됩니다. 본인 변경이 실제로 동작하는지 여기서 확인하고, 이슈에 결과를 남깁니다.

### 8) 정리
머지된 브랜치는 삭제합니다.
```bash
git checkout staging
git pull
git branch -d feat/login-button
```

---

## 하면 안 되는 것 (사고 방지)

- ❌ `main` 또는 `staging` 에서 바로 작업/커밋/푸시
- ❌ 공용 브랜치에 `git push --force`
- ❌ `.env*` 커밋, 운영 DB 접속정보 로컬 사용
- ❌ 한 PR 에 관계없는 변경 여러 개 섞기
- ❌ base 를 `main` 으로 잡은 작업 PR

---

## 에이전트(Claude Code / Cursor / Codex)로 작업할 때

**규칙은 `AGENTS.md` 하나입니다.** 도구별로 갈라 쓰지 않습니다.
`AGENTS.md` 와 코드가 어긋나면 **코드가 맞습니다.** 그때는 코드를 고치지 말고 문서를 고치세요.

막히면 언제든 메인테이너에게 물어보세요. **모르고 진행하는 것보다 멈추고 묻는 게 항상 낫습니다.**
