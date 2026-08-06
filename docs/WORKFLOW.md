# 개발 워크플로

템플릿은 양식이고, 이 문서는 **추적 규칙**이다. 사람 리뷰어가 없으므로 추적이 유일한 안전장치다.

## 작업 단위

| 단위 | 뜻 | 라벨 |
|---|---|---|
| **Epic** | 한 스프린트에 끝내는 기능 묶음. 코드를 담지 않는다 | `type:epic` |
| **Feature / Bug / Chore** | PR 1개로 끝나는 작업. Epic의 자식 | `type:feature` 등 |

한 이슈 = 한 브랜치 = 한 PR. 이걸 어기면 되돌리기가 불가능해진다.

## 상태 흐름

```
status:needs-spec  →  status:ready  →  status:in-progress  →  (PR 머지되며 close)
                          ↑                    ↓
                          └──── status:blocked ┘
```

- **에이전트는 `status:ready` 인 이슈만 집는다.** `needs-spec` 을 집으면 스펙을 지어내게 된다.
- 브랜치를 만드는 순간 `status:in-progress` 로 옮긴다.
- 외부 결정·의존 대기는 `status:blocked` 로 두고 사유를 코멘트로 남긴다.

## 큰 기능은 스펙을 먼저 만든다

3개 이상의 이슈로 쪼개질 기능은 `/skill:deep-interview` 로 스펙을 뽑아 `docs/specs/YYYY-MM-DD-<slug>.md` 로 커밋하고, 그 경로를 **Epic 본문 맨 위에 링크**한다. 하위 이슈의 인수 조건은 스펙의 AC 번호를 그대로 인용한다.

```
스펙 AC-7  →  이슈 #42 인수 조건  →  PR #58 검증 증거
```

이 사슬이 끊기면 나중에 "이건 왜 이렇게 만들었나"에 답할 수 없다.

## PR

- 제목이 아니라 본문의 `Closes #<번호>` 가 추적의 실체다. 반드시 넣는다.
- **실행한 명령과 실제 출력을 붙인다.** 사람이 안 보므로 "확인했습니다"는 아무 의미가 없다.
- CI(quality / api-e2e / browser-e2e / impact-review)가 전부 초록이어야 머지한다.
- 이슈 범위 밖으로 나간 파일이 있으면 PR 본문에 이유와 함께 적는다. 조용히 섞으면 리뷰가 없는 이 저장소에서는 아무도 못 잡는다.

## 스프린트 종료

Epic의 Definition of Done을 모두 체크하고 닫는다. 남은 하위 이슈는 다음 Epic으로 옮기거나 닫는다. **열린 채로 방치하지 않는다.**

## 라벨 적용

```bash
bash .github/scripts/sync-labels.sh
```
