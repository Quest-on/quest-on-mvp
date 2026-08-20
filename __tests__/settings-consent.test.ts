import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "app/(app)/settings/page.tsx"), "utf8");
const ko = JSON.parse(fs.readFileSync(path.join(root, "messages/ko/auth.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "messages/en/auth.json"), "utf8"));

describe("settings consent center", () => {
  it("uses the shared query key and authenticated status endpoint", () => {
    expect(page).toContain("qk.consent.status");
    expect(page).toContain('fetch("/api/consents/onboarding")');
  });

  it("links incomplete users back to onboarding without replacing the gate", () => {
    // href 가 삼항으로 바뀌었다 — 동의를 마친 사람은 온보딩 전체를 다시
    // 걷고(`/onboarding`), 미완료인 사람은 동의만 받고 여기로 돌아온다.
    // 계약(미완료 -> 설정 복귀)은 그대로니 목적지 문자열만 확인한다.
    expect(page).toContain('"/onboarding?redirect=/settings"');
    expect(page).toContain('href="/legal/privacy"');
    expect(page).toContain('href="/legal/terms"');
  });

  it("keeps Korean and English settings messages aligned", () => {
    expect(Object.keys(ko.settings).sort()).toEqual(Object.keys(en.settings).sort());
    for (const key of Object.keys(ko.settings)) {
      expect(ko.settings[key]).toBeTruthy();
      expect(en.settings[key]).toBeTruthy();
    }
  });
});
