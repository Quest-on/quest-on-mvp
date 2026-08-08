# 기여 가이드 (Quest-On)

이 문서는 **개발이 처음인 팀원**도 그대로 따라 할 수 있게 쓰였습니다.
우리 팀은 **포크(Fork) 기반 워크플로**를 씁니다. `main`은 오너(@jcmaker)만 머지합니다.

---

## 한 장 요약

```
원본(upstream: jcmaker/quest-on)  ──fork──▶  내 포크(origin: 내아이디/quest-on)
                                                      │
                                          ① 브랜치 만들어 작업
                                                      │
                                          ② 내 포크로 push
                                                      │
                                          ③ 원본으로 Pull Request
                                                      ▼
                                       @jcmaker 리뷰 → CI 통과 → Squash 머지
```

- **`main`에 직접 push 금지.** (애초에 권한이 없습니다.)
- **작업 1개 = 브랜치 1개 = PR 1개.** 작게, 자주.
- **force-push(강제 푸시)는 내 포크의 내 브랜치에서만.** 공용 브랜치엔 절대 금지.

---

## ⚠️ 시작 전 가장 중요한 경고 — 데이터베이스

이 프로젝트의 로컬 환경(`.env.local`)은 **실제 운영 데이터베이스를 가리킬 수 있습니다.**
설정을 잘못하면 **로컬에서 앱을 돌리는 것만으로 실제 사용자 데이터가 바뀝니다.**

- 반드시 @jcmaker에게 **본인용 개발/스테이징 DB 접속 정보**를 받아서 쓰세요.
- 운영 DB 접속 정보를 본인 `.env.local`에 넣지 마세요.
- `.env`, `.env.local` 파일은 **절대 커밋하지 마세요.** (이미 gitignore 처리됨)
- 헷갈리면 멈추고 물어보세요. 지우는 것보다 안 건드리는 게 낫습니다.

---

## 처음 한 번만 하는 세팅

> CLI가 어렵다면 **GitHub Desktop** 또는 **VS Code의 Git 화면**을 써도 됩니다.
> 아래는 터미널 기준이며, 명령은 그대로 복사해서 쓰면 됩니다.

1. GitHub에서 `jcmaker/quest-on` 페이지 오른쪽 위 **Fork** 클릭 → 내 계정으로 포크 생성.
2. 내 포크를 클론:
   ```bash
   git clone https://github.com/<내아이디>/quest-on.git
   cd quest-on
   ```
3. 원본(upstream)을 등록 — 최신 변경을 받아오기 위해 필요합니다:
   ```bash
   git remote add upstream https://github.com/jcmaker/quest-on.git
   git remote -v   # origin=내포크, upstream=원본 이 보이면 OK
   ```
4. 의존성 설치:
   ```bash
   npm install
   ```
   > `npm install` 시 **안전장치(git hook)가 자동 설치**됩니다. 이후 `main`에 실수로 커밋·push하려 하면 git이 막아주고, 작업 브랜치로 안내합니다. (메인테이너 @jcmaker는 면제)
5. @jcmaker에게 받은 **개발용 환경변수**를 `.env.local`에 넣기.

---

## 작업할 때마다 반복하는 흐름

> 브랜치는 2단계입니다. 작업 PR 은 전부 `staging` 으로 올리고, 스테이징(staging.quest-on.app)에서 QA 를 통과한 것만 `staging` → `main` 승격 PR 로 프로덕션에 나갑니다. 환경 설명은 `docs/STAGING.md`.

### 1) 최신 staging 받아오기 (작업 시작 전 항상)
```bash
git fetch upstream staging            # staging 을 아직 모르는 클론에서도 받아온다
git checkout -B staging FETCH_HEAD    # 내 staging 을 원본과 똑같이 맞춤 (없으면 새로 만듦)
```

### 2) 작업용 브랜치 만들기
브랜치 이름 규칙: `<종류>/<짧은-설명>`
```bash
git checkout -b feat/login-button
```
| 종류 | 언제 |
|------|------|
| `feat/` | 새 기능 |
| `fix/`  | 버그 수정 |
| `docs/` | 문서만 |
| `chore/`| 설정·잡일 |

### 3) 작업 → 커밋
```bash
git add -A
git commit -m "feat: 로그인 버튼 추가"
```
- 커밋 메시지는 **무엇을 했는지** 한 줄로. (한국어 OK)
- 커밋에 `Co-Authored-By` 줄은 넣지 않습니다.

### 4) 내 포크로 push
```bash
git push -u origin feat/login-button
```

### 5) Pull Request 열기
- GitHub가 안내하는 **"Compare & pull request"** 버튼을 누르거나, 포크 페이지에서 **Contribute → Open pull request**.
- base(받는 쪽)는 `jcmaker/quest-on : staging`, compare(주는 쪽)는 내 브랜치.
- 템플릿에 따라 **무엇을·왜** 바꿨는지 적기.
- **Draft PR**로 먼저 열어 진행 중임을 알려도 좋습니다.

### 6) 리뷰 반영
- @jcmaker가 코멘트를 남기면 같은 브랜치에서 수정 후 다시 push하면 PR이 자동 갱신됩니다.
- **CI가 초록불**이고 승인되면 @jcmaker가 **Squash 머지**합니다.

### 7) 정리
머지된 브랜치는 삭제합니다.
```bash
git checkout main
git branch -d feat/login-button
```

---

## 하면 안 되는 것 (사고 방지)

- ❌ `main`에서 바로 작업/커밋
- ❌ 공용 브랜치에 `git push --force`
- ❌ `.env*` 커밋, 운영 DB 접속정보 로컬 사용
- ❌ 한 PR에 관계없는 변경 여러 개 섞기
- ❌ 리뷰 없이 머지

막히면 언제든 @jcmaker에게 물어보세요. **모르고 진행하는 것보다 멈추고 묻는 게 항상 낫습니다.**
