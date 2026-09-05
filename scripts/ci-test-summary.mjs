#!/usr/bin/env node
/**
 * JUnit XML 을 GitHub Actions 잡 요약으로 옮긴다.
 *
 * 예전에는 `test-summary/action` 을 썼다. 그런데 codeload 가
 * `429 Too Many Requests` 를 내면 잡 전체가 red 가 됐다. 액션 다운로드는
 * 스텝 실행 **전** 단계라 `continue-on-error` 가 닿지 않는다 — 실제로 걸어
 * 보고 확인했다(로그 39줄, 테스트 스텝은 시작조차 못 함).
 *
 * 보고 때문에 테스트 신호를 잃을 이유가 없다. 외부 의존을 없앤다.
 *
 * 사용: node scripts/ci-test-summary.mjs <junit.xml ...>
 * 출력: $GITHUB_STEP_SUMMARY 에 append. 없으면 stdout.
 *
 * 이 스크립트는 절대 0 이외로 종료하지 않는다. 요약이 실패해도 CI 는
 * 테스트 결과로 판정돼야 한다.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const attr = (xml, key) => {
  const m = xml.match(new RegExp(`${key}="([^"]*)"`));
  return m ? m[1] : "?";
};

function main() {
  const files = process.argv.slice(2);
  const lines = ["### 테스트 결과", ""];

  if (files.length === 0) {
    lines.push("결과 파일이 없다.");
  } else {
    lines.push("| 파일 | 전체 | 실패 | 오류 | 건너뜀 |", "|---|---:|---:|---:|---:|");
    let totalFailures = 0;
    for (const file of files) {
      let xml;
      try {
        xml = readFileSync(file, "utf8");
      } catch {
        lines.push(`| ${basename(file)} | 읽기 실패 | - | - | - |`);
        continue;
      }
      const f = attr(xml, "failures");
      const e = attr(xml, "errors");
      totalFailures += (Number(f) || 0) + (Number(e) || 0);
      lines.push(
        `| ${basename(file)} | ${attr(xml, "tests")} | ${f} | ${e} | ${attr(xml, "skipped")} |`
      );
    }
    if (totalFailures > 0) {
      lines.push("", `**실패 ${totalFailures}건.** 잡 로그에서 상세를 확인한다.`);
    }
  }

  const body = lines.join("\n") + "\n";
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, body);
  else process.stdout.write(body);
}

try {
  main();
} catch (err) {
  // 요약 실패가 잡을 죽이지 않는다.
  process.stdout.write(`테스트 요약 생성 실패: ${err instanceof Error ? err.message : err}\n`);
}
