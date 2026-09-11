import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Windows 체크아웃(core.autocrlf=true)에서는 파일이 CRLF로 내려온다. 정규식이
// 운영체제별 줄바꿈 차이를 실패로 오인하지 않도록 읽을 때 LF로 정규화한다.
const root = path.resolve(__dirname, "..");
const readText = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

describe("CI toolchain pin", () => {
  it("pins the Supabase CLI without resolving latest releases", () => {
    const testSetup = readText(".github/actions/test-setup/action.yml");

    expect(testSetup).toMatch(/uses: supabase\/setup-cli@v1/);
    expect(testSetup).not.toMatch(/version:\s*latest\b/);
    expect(testSetup).toMatch(/version:\s*\d+\.\d+\.\d+\b/);
    expect(testSetup).toMatch(/#.*`latest`.*GitHub API.*rate limit/);
    expect(testSetup).toMatch(/#.*로컬 스택을 갱신할 때.*검증 후 함께 올린다/);
  });
});
