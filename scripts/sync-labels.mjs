#!/usr/bin/env node
// .github/labels.yml 의 라벨을 저장소에 반영한다 (있으면 갱신, 없으면 생성).
// 필요: gh CLI 로그인. 사용: node scripts/sync-labels.mjs [owner/repo]
// 인자를 생략하면 현재 체크아웃의 저장소를 자동 감지한다(포크 안전).
//
// bash 대신 Node 인 이유: Windows 환경에서 중첩 bash 가 WSL bash 로 잡혀
// gh 의 PATH 와 /c/... 경로가 모두 보이지 않는 사례가 있었다.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 인자가 없으면 현재 체크아웃의 저장소를 쓴다. upstream 을 하드코딩해 두면
// 포크에서 이 명령을 그대로 실행했을 때 자기 저장소가 아니라 upstream 을 건드리거나
// (토큰 권한에 따라) 조용히 실패한다.
function detectRepo() {
  const viaGh = spawnSync(
    process.platform === "win32" ? "gh.exe" : "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { encoding: "utf8" }
  );
  const name = (viaGh.stdout ?? "").trim();
  if (viaGh.status === 0 && /^[^/\s]+\/[^/\s]+$/.test(name)) return name;
  return null;
}

const repoArg = process.argv[2];
const here = dirname(fileURLToPath(import.meta.url));
const labelsPath = join(here, "..", ".github", "labels.yml");

/** labels.yml 은 `- name/color/description` 만 쓰는 평평한 목록이라 의존성 없이 읽는다. */
function parseLabels(text) {
  const labels = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#") || line === "") continue;
    const unquote = (v) => v.replace(/^["']|["']$/g, "");
    if (line.startsWith("- name:")) {
      if (current) labels.push(current);
      current = { name: unquote(line.slice("- name:".length).trim()) };
    } else if (current && line.startsWith("color:")) {
      current.color = unquote(line.slice("color:".length).trim());
    } else if (current && line.startsWith("description:")) {
      current.description = unquote(line.slice("description:".length).trim());
    }
  }
  if (current) labels.push(current);
  return labels;
}

function gh(args) {
  // shell:true 를 쓰면 Windows 에서 공백 포함 인자가 재분해되어 gh 가 "too many arguments" 로 죽는다.
  // shell 없이 실행하되 Windows 에서는 확장자를 명시해 PATH 조회가 되게 한다.
  const bin = process.platform === "win32" ? "gh.exe" : "gh";
  return spawnSync(bin, args, { encoding: "utf8" });
}

const probe = gh(["--version"]);
if (probe.error || probe.status !== 0) {
  console.error("gh CLI 를 찾을 수 없습니다. 설치 후 `gh auth login` 하세요.");
  process.exit(1);
}

const repo = repoArg ?? detectRepo();
if (!repo) {
  console.error(
    "대상 저장소를 알 수 없습니다. 이 디렉터리에서 `gh repo view` 가 되는지 확인하거나\n" +
      "명시적으로 지정하세요: node scripts/sync-labels.mjs <owner>/<repo>"
  );
  process.exit(1);
}
console.log(`대상 저장소: ${repo}`);

const labels = parseLabels(readFileSync(labelsPath, "utf8"));
if (labels.length === 0) {
  console.error(`라벨을 읽지 못했습니다: ${labelsPath}`);
  process.exit(1);
}

let failed = 0;
for (const { name, color, description } of labels) {
  if (!name || !color) {
    console.error(`건너뜀(불완전): ${JSON.stringify({ name, color })}`);
    failed++;
    continue;
  }
  const flags = ["--repo", repo, "--color", color, "--description", description ?? ""];
  let res = gh(["label", "create", name, ...flags]);
  if (res.status !== 0) res = gh(["label", "edit", name, ...flags]);
  if (res.status !== 0) {
    console.error(`실패: ${name}\n${(res.stderr || "").trim()}`);
    failed++;
  } else {
    console.log(`synced: ${name}`);
  }
}

console.log(`\n${labels.length - failed}/${labels.length} 라벨 반영 완료 (${repo})`);
process.exit(failed > 0 ? 1 : 0);
