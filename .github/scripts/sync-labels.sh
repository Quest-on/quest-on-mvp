#!/usr/bin/env bash
# .github/labels.yml 의 라벨을 저장소에 반영한다 (있으면 갱신, 없으면 생성).
# 필요: gh CLI 로그인. 사용: bash .github/scripts/sync-labels.sh [owner/repo]
set -euo pipefail

REPO="${1:-jcmaker/quest-on}"
FILE="$(dirname "$0")/../labels.yml"

name=""; color=""; desc=""

flush() {
  [ -z "$name" ] && return 0
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null \
    || gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc"
  echo "synced: $name"
  name=""; color=""; desc=""
}

while IFS= read -r line; do
  case "$line" in
    "- name: "*) flush; name="${line#*: }"; name="${name%\"}"; name="${name#\"}" ;;
    *"color: "*) color="${line#*: }"; color="${color%\"}"; color="${color#\"}" ;;
    *"description: "*) desc="${line#*: }"; desc="${desc%\"}"; desc="${desc#\"}" ;;
  esac
done < "$FILE"
flush
