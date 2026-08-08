#!/bin/sh
# 공용 가드 로직 — pre-commit / pre-push 가 함께 사용.
# main·staging 보호용. 단, 메인테이너(jcmaker)는 자유롭게 통과시킨다.
#
# main    = 프로덕션(quest-on.app)
# staging = 스테이징(staging.quest-on.app). 작업 PR 의 base 이므로 직접 커밋 금지.
PROTECTED_BRANCHES="main staging"

# 인자로 받은 브랜치가 보호 대상인가.
is_protected_branch() {
  for _protected in $PROTECTED_BRANCHES; do
    if [ "$1" = "$_protected" ]; then
      return 0
    fi
  done
  return 1
}

# 메인테이너(= 자유 통과 대상)인지 판단.
#   1) 로컬 git config `questOn.maintainer true`  (jcmaker 클론에만 설정, 커밋 안 됨)
#   2) git 커밋 이메일에 "jcmaker" 가 포함  (예: 35755925+jcmaker@users.noreply.github.com)
# 둘 중 하나라도 맞으면 면제.
is_maintainer() {
  if [ "$(git config --get questOn.maintainer 2>/dev/null)" = "true" ]; then
    return 0
  fi

  # 테스트 seam: GUARD_TEST_EMAIL 이 있으면 그 값을 쓴다(평상시엔 미설정).
  _email="${GUARD_TEST_EMAIL:-$(git config user.email 2>/dev/null)}"
  case "$_email" in
    *jcmaker*) return 0 ;;
  esac

  return 1
}
