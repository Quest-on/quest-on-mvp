/**
 * Supabase Auth 메일 템플릿 원본 (이슈 #504).
 *
 * 템플릿은 Supabase 설정에 올라가 있고 앱이 읽지 않는다. 그래서 깨져도 앱의 어떤
 * 테스트도 모른다 — 발송 시점에 `<no value>` 가 찍히거나 메일이 안 나갈 뿐이다. 이
 * 파일이 그 사이를 이어 준다.
 *
 * 지키는 것:
 * - 저장소의 HTML 이 생성기 출력과 같다(드리프트). 한쪽만 고치면 배포본과 원본이 갈라진다.
 * - 본문이 쓰는 Go 템플릿 변수가 종류마다 허용된 것뿐이다.
 * - 본문의 유효 시간이 `mailer_otp_exp` 와 같다 — 템플릿은 설정을 읽을 수 없다. 예전엔
 *   본문이 "5분", 설정이 3600초였다.
 * - 재설정 링크 경로가 실제 라우트와 같다.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  buildTemplates,
  EXPIRY_MINUTES,
  OTP_EXPIRY_SECONDS,
  supabaseKeys,
} from "../scripts/auth-email-templates";

const DOCS = join(process.cwd(), "docs", "email-templates");
const read = (name: string) => readFileSync(join(DOCS, name), "utf8");

const templates = buildTemplates();
const legacyRecovery = buildTemplates({ recoveryLink: "confirmation_url" }).find(
  (t) => t.key === "recovery"
)!;
const find = (key: string) => templates.find((t) => t.key === key)!;

/** 발송 시 사용자에게 유효 시간을 안내하는 종류. 알림 메일에는 없다. */
const EXPIRING = [
  "confirmation",
  "recovery",
  "reauthentication",
  "magic_link",
  "invite",
  "email_change",
];

describe("저장소의 템플릿 원본이 생성기 출력과 같다", () => {
  it("13종이고 키가 겹치지 않는다", () => {
    expect(templates).toHaveLength(13);
    expect(new Set(templates.map((t) => t.key)).size).toBe(13);
  });

  it.each(templates.map((t) => [t.key, t] as const))("%s.html", (key, t) => {
    expect(read(`${key}.html`)).toBe(t.html);
  });

  it("recovery.legacy.html — production 이 라우트가 올라가기 전까지 쓰는 변형", () => {
    expect(read("recovery.legacy.html")).toBe(legacyRecovery.html);
  });

  it("subjects.json", () => {
    const expected = Object.fromEntries(templates.map((t) => [t.key, t.subject]));
    expect(JSON.parse(read("subjects.json"))).toEqual(expected);
  });

  it("생성기가 모르는 HTML 이 폴더에 남아 있지 않다", () => {
    const expected = new Set([...templates.map((t) => `${t.key}.html`), "recovery.legacy.html"]);
    const actual = readdirSync(DOCS).filter((f) => f.endsWith(".html"));
    expect(actual.filter((f) => !expected.has(f))).toEqual([]);
  });

  it("Supabase 키 이름이 Management API 의 mailer_* 형태다", () => {
    expect(supabaseKeys("recovery")).toEqual({
      content: "mailer_templates_recovery_content",
      subject: "mailer_subjects_recovery",
    });
  });
});

describe("Go 템플릿 변수", () => {
  it.each(
    [...templates, legacyRecovery].map((t, i) => [i === templates.length ? "recovery(legacy)" : t.key, t] as const)
  )("%s 는 허용된 변수만 쓴다", (_label, t) => {
    const actions = t.html.match(/\{\{[^}]*\}\}/g) ?? [];
    for (const action of actions) {
      // `{{ .Var }}` 한 가지 모양만 쓴다. 파이프·조건·함수는 GoTrue 버전마다 달라 깨지기 쉽다.
      const m = action.match(/^\{\{ \.(\w+) \}\}$/);
      expect(m, `${t.key}: ${action}`).not.toBeNull();
      expect(t.vars, `${t.key}: ${action}`).toContain(m![1]);
    }
    expect((t.html.match(/\{\{/g) ?? []).length).toBe((t.html.match(/\}\}/g) ?? []).length);
  });

  it("알림 메일은 SiteURL 도 이미지도 쓰지 않는다 — 알림 데이터에 SiteURL 이 있는지 확인되지 않았다", () => {
    for (const t of templates.filter((t) => t.key.endsWith("_notification"))) {
      expect(t.html, t.key).not.toContain("SiteURL");
      expect(t.html, t.key).not.toContain("<img");
    }
  });

  it("행동 메일은 로고를 앱 도메인의 PNG 로 불러온다 (SVG 는 메일 클라이언트가 못 그린다)", () => {
    for (const key of EXPIRING) {
      expect(find(key).html, key).toContain('src="{{ .SiteURL }}/qlogo_icon.png"');
    }
    expect(existsSync(join(process.cwd(), "public", "qlogo_icon.png"))).toBe(true);
  });
});

describe("제목과 문구", () => {
  it("제목은 한글이고 브랜드 이름을 담는다", () => {
    for (const t of templates) {
      expect(t.subject, t.key).toMatch(/[가-힣]/);
      expect(t.subject, t.key).toContain("Quest-On");
    }
  });

  it("영어 기본 문구가 남아 있지 않다", () => {
    for (const t of templates) {
      expect(t.html, t.key).not.toMatch(/Follow this link|Confirm your|Reset Password|Magic Link/i);
    }
  });

  it("html 문서이고 lang 이 ko 다", () => {
    for (const t of templates) expect(t.html, t.key).toMatch(/^<!doctype html>\n<html lang="ko">/);
  });
});

describe("유효 시간은 mailer_otp_exp 와 같다", () => {
  it("본문의 분 단위 안내가 설정(초)과 같다", () => {
    expect(OTP_EXPIRY_SECONDS).toBe(EXPIRY_MINUTES * 60);
  });

  it.each(EXPIRING)("%s 는 유효 시간을 안내하고, 다른 시간을 말하지 않는다", (key) => {
    const text = find(key).html.replace(/<[^>]+>/g, " ");
    const minutes = [...text.matchAll(/(\d+)\s*분/g)].map((m) => Number(m[1]));
    expect(minutes.length).toBeGreaterThan(0);
    expect(new Set(minutes)).toEqual(new Set([EXPIRY_MINUTES]));
    expect(text).not.toMatch(/\d+\s*시간 동안/);
  });

  it("알림 메일은 유효 시간을 말하지 않는다 — 만료가 없다", () => {
    for (const t of templates.filter((t) => t.key.endsWith("_notification"))) {
      expect(t.html.replace(/<[^>]+>/g, " "), t.key).not.toMatch(/\d+\s*분/);
    }
  });

  it("README 가 같은 초를 적고 있다 — 설정을 바꿀 사람이 읽는 곳", () => {
    expect(read("README.md")).toContain(`mailer_otp_exp\` = ${OTP_EXPIRY_SECONDS}`);
  });
});

describe("재설정 링크", () => {
  const route = join(process.cwd(), "app", "auth", "recovery", "page.tsx");

  it("새 링크 경로가 실제 라우트와 같다", () => {
    expect(existsSync(route)).toBe(true);
    const page = readFileSync(route, "utf8");
    // 라우트가 읽는 쿼리 이름과 메일이 싣는 이름이 같아야 한다.
    expect(page).toContain("token_hash");
    expect(page).toContain('"recovery"');
    // `&` 는 속성 안에서 `&amp;` 로 쓴다.
    expect(find("recovery").html).toContain(
      'href="{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&amp;type=recovery"'
    );
  });

  it("legacy 변형은 GoTrue 기본 링크이고 새 라우트를 가리키지 않는다", () => {
    expect(legacyRecovery.html).toContain('href="{{ .ConfirmationURL }}"');
    expect(legacyRecovery.html).not.toContain("/auth/recovery");
    expect(legacyRecovery.html).not.toContain("TokenHash");
  });
});
