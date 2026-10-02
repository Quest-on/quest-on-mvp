/**
 * Supabase Auth 메일 템플릿 생성기 (이슈 #504).
 *
 *   npx tsx scripts/auth-email-templates.ts write   # docs/email-templates/ 를 다시 만든다
 *
 * 가입 인증번호·비밀번호 재설정 등 Supabase 가 보내는 메일 13종을 공통 레이아웃으로
 * 만든다. 결과는 `docs/email-templates/` 에 커밋되고, 테스트가 이 코드의 출력과 같은지
 * 본다. **Supabase 설정에 올리는 일은 여기서 하지 않는다** — production 인증 설정을
 * 바꾸는 명령이라 사람의 명시 승인 사안이다. 절차는 docs/email-templates/README.md.
 *
 * 레이아웃은 표 기반 + 인라인 스타일이다. 메일 클라이언트는 <style>·flex·grid 를
 * 믿을 수 없다. 색은 앱의 `--primary`(hsl(222 56% 49%)) 를 hex 로 옮긴 값이다.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

/**
 * 본문의 유효 시간 문구. **`mailer_otp_exp`(= OTP_EXPIRY_SECONDS) 와 같아야 한다.**
 * 템플릿은 설정값을 읽을 수 없어 손으로 맞춘다 — 예전엔 본문이 "5분", 설정이 3600초
 * 여서 사용자가 실제와 다르게 안내받았다. 테스트가 둘을 묶는다.
 */
export const EXPIRY_MINUTES = 15;
export const OTP_EXPIRY_SECONDS = EXPIRY_MINUTES * 60;
const EXPIRY = `${EXPIRY_MINUTES}분`;

export type TemplateKey =
  | "confirmation"
  | "recovery"
  | "reauthentication"
  | "magic_link"
  | "invite"
  | "email_change"
  | "password_changed_notification"
  | "email_changed_notification"
  | "phone_changed_notification"
  | "mfa_factor_enrolled_notification"
  | "mfa_factor_unenrolled_notification"
  | "identity_linked_notification"
  | "identity_unlinked_notification";

/**
 * 재설정 메일의 링크 방식.
 *
 * - `token_hash`: `{{ .SiteURL }}/auth/recovery?token_hash=…` — #318 의 새 흐름. 라우트가
 *   있는 환경(staging)에서 쓴다.
 * - `confirmation_url`: GoTrue 기본 링크. **production 에 `/auth/recovery` 가 올라가기
 *   전까지** production 이 쓴다. 새 링크를 먼저 실으면 proxy 가
 *   `/sign-in?redirect=…token_hash…` 로 돌려보내 1회용 토큰이 주소에 실린다.
 */
export type RecoveryLink = "token_hash" | "confirmation_url";

export type EmailTemplate = {
  key: TemplateKey;
  subject: string;
  html: string;
  /** 이 템플릿이 쓸 수 있는 Go 템플릿 변수. 테스트가 본문과 대조한다. */
  vars: readonly string[];
};

const C = {
  primary: "#3761C3",
  ink: "#09090B",
  body: "#3F3F46",
  muted: "#6C6C75",
  line: "#E5E7EB",
  soft: "#F4F6FB",
  page: "#F4F5F7",
};
const FONT =
  "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕','Noto Sans KR','Segoe UI',Roboto,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

const p = (t: string, extra = "") =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${C.body};word-break:keep-all;overflow-wrap:break-word;${extra}">${t}</p>`;
const note = (t: string) =>
  p(t, `font-size:13px;line-height:1.6;color:${C.muted};`);
const code = (v: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px"><tr><td align="center" style="background:${C.soft};border:1px solid ${C.line};border-radius:10px;padding:20px 12px;font-family:${MONO};font-size:32px;line-height:1.2;font-weight:700;letter-spacing:6px;color:${C.primary}">${v}</td></tr></table>`;
const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td align="center" bgcolor="${C.primary}" style="border-radius:8px;background:${C.primary}"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:8px">${label}</a></td></tr></table>`;
const info = (rows: Array<[string, string]>) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;background:${C.soft};border:1px solid ${C.line};border-radius:10px"><tr><td style="padding:14px 16px 6px">${rows
    .map(
      ([k, v]) =>
        `<div style="font-size:13px;line-height:1.5;color:${C.muted}">${k}</div><div style="font-size:15px;line-height:1.6;color:${C.ink};font-weight:600;word-break:break-all;margin-bottom:10px">${v}</div>`
    )
    .join("")}</td></tr></table>`;

/**
 * `assets: false` — 알림 메일은 `.SiteURL` 이 템플릿 데이터에 있는지 확인되지 않아
 * 로고 이미지와 주소 푸터를 뺀다. 없는 키는 `<no value>` 로 찍히거나 발송이 실패한다.
 */
const layout = (o: { title: string; preheader: string; body: string; assets: boolean }) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${o.title}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${o.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid ${C.line};border-radius:12px;overflow:hidden;font-family:${FONT};">
<tr><td style="height:4px;line-height:4px;font-size:0;background:${C.primary};">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 4px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${
  o.assets
    ? `<td style="padding-right:10px;vertical-align:middle;"><img src="{{ .SiteURL }}/qlogo_icon.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td>`
    : ""
}<td style="vertical-align:middle;font-size:20px;font-weight:800;color:${C.ink};letter-spacing:-0.3px;">Quest-On</td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px 8px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;font-weight:800;color:${C.ink};word-break:keep-all;overflow-wrap:break-word;">${o.title}</h1>
${o.body}
</td></tr>
<tr><td style="padding:0 32px 28px;"><div style="border-top:1px solid ${C.line};padding-top:16px;font-size:12px;line-height:1.6;color:${C.muted};">이 메일은 Quest-On에서 자동으로 발송되었습니다. 회신하셔도 확인할 수 없습니다.${o.assets ? "<br>{{ .SiteURL }}" : ""}</div></td></tr>
</table>
</td></tr></table>
</body>
</html>
`;

const IGNORE = "본인이 요청하지 않았다면 이 메일을 무시해 주세요.";
const ALERT = "본인이 한 일이 아니라면 즉시 비밀번호를 재설정하고 관리자에게 알려 주세요.";

type Spec = {
  key: TemplateKey;
  subject: string;
  assets: boolean;
  vars: readonly string[];
  title: string;
  preheader: string;
  body: () => string;
};

function specs(recoveryLink: RecoveryLink): Spec[] {
  const legacy = recoveryLink === "confirmation_url";
  return [
    {
      key: "confirmation",
      subject: "Quest-On 가입 인증번호",
      assets: true,
      vars: ["SiteURL", "Token"],
      title: "가입을 환영합니다",
      preheader: `가입 인증번호입니다. ${EXPIRY} 안에 입력해 주세요.`,
      body: () =>
        p("Quest-On에 가입해 주셔서 감사합니다. 아래 인증번호를 가입 화면에 입력해 주세요.") +
        code("{{ .Token }}") +
        note(`이 인증번호는 ${EXPIRY} 동안 유효합니다. 다른 사람에게 알려주지 마세요.`) +
        note(IGNORE),
    },
    {
      key: "recovery",
      subject: "Quest-On 비밀번호 재설정 안내",
      assets: true,
      vars: legacy ? ["SiteURL", "ConfirmationURL"] : ["SiteURL", "TokenHash"],
      title: "비밀번호 재설정",
      preheader: `비밀번호 재설정 링크입니다. ${EXPIRY} 동안 한 번만 사용할 수 있습니다.`,
      body: () =>
        p(
          legacy
            ? "비밀번호 재설정 요청을 받았습니다. 아래 버튼을 눌러 계속 진행해 주세요."
            : "비밀번호 재설정 요청을 받았습니다. 아래 버튼을 누르면 확인 화면이 열리고, 확인한 뒤에 새 비밀번호를 정할 수 있습니다."
        ) +
        button(
          legacy
            ? "{{ .ConfirmationURL }}"
            : "{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&amp;type=recovery",
          "비밀번호 재설정하기"
        ) +
        note(`이 링크는 ${EXPIRY} 동안 유효하며 한 번만 사용할 수 있습니다.`) +
        note("요청하지 않았다면 링크를 누르지 말고 이 메일을 삭제해 주세요. 비밀번호는 바뀌지 않습니다."),
    },
    {
      key: "reauthentication",
      subject: "Quest-On 본인 확인 인증번호",
      assets: true,
      vars: ["SiteURL", "Token"],
      title: "본인 확인",
      preheader: `본인 확인 인증번호입니다. ${EXPIRY} 안에 입력해 주세요.`,
      body: () =>
        p("중요한 작업을 계속하려면 아래 인증번호를 입력해 주세요.") +
        code("{{ .Token }}") +
        note(`이 인증번호는 ${EXPIRY} 동안 유효합니다. 다른 사람에게 알려주지 마세요.`) +
        note(IGNORE),
    },
    {
      key: "magic_link",
      subject: "Quest-On 로그인 링크",
      assets: true,
      vars: ["SiteURL", "ConfirmationURL"],
      title: "로그인 링크",
      preheader: `아래 버튼으로 로그인하세요. ${EXPIRY} 동안 유효합니다.`,
      body: () =>
        p("아래 버튼을 누르면 Quest-On에 로그인됩니다.") +
        button("{{ .ConfirmationURL }}", "로그인하기") +
        note(`이 링크는 ${EXPIRY} 동안 유효하며 한 번만 사용할 수 있습니다.`) +
        note(IGNORE),
    },
    {
      key: "invite",
      subject: "Quest-On에 초대되었습니다",
      assets: true,
      vars: ["SiteURL", "ConfirmationURL"],
      title: "Quest-On에 초대되었습니다",
      preheader: `초대를 수락하고 계정을 만들어 주세요. ${EXPIRY} 동안 유효합니다.`,
      body: () =>
        p("Quest-On 계정을 만들도록 초대받았습니다. 아래 버튼을 눌러 초대를 수락해 주세요.") +
        button("{{ .ConfirmationURL }}", "초대 수락하기") +
        note(`이 링크는 ${EXPIRY} 동안 유효합니다.`) +
        note("초대를 기대하지 않았다면 이 메일을 무시해 주세요."),
    },
    {
      key: "email_change",
      subject: "Quest-On 이메일 주소 변경 확인",
      assets: true,
      vars: ["SiteURL", "Email", "NewEmail", "ConfirmationURL"],
      title: "이메일 주소 변경 확인",
      preheader: `이메일 주소 변경을 확인해 주세요. ${EXPIRY} 동안 유효합니다.`,
      body: () =>
        p("계정의 이메일 주소를 바꾸려는 요청이 있었습니다.") +
        info([
          ["변경 전", "{{ .Email }}"],
          ["변경 후", "{{ .NewEmail }}"],
        ]) +
        p("본인이 요청한 것이 맞다면 아래 버튼을 눌러 변경을 확인해 주세요.") +
        button("{{ .ConfirmationURL }}", "변경 확인하기") +
        note(`이 링크는 ${EXPIRY} 동안 유효합니다.`) +
        note(IGNORE),
    },
    {
      key: "password_changed_notification",
      subject: "Quest-On 비밀번호가 변경되었습니다",
      assets: false,
      vars: ["Email"],
      title: "비밀번호가 변경되었습니다",
      preheader: "계정의 비밀번호가 변경되었습니다.",
      body: () =>
        p("아래 계정의 비밀번호가 방금 변경되었습니다.") + info([["계정", "{{ .Email }}"]]) + note(ALERT),
    },
    {
      key: "email_changed_notification",
      subject: "Quest-On 이메일 주소가 변경되었습니다",
      assets: false,
      vars: ["OldEmail", "Email"],
      title: "이메일 주소가 변경되었습니다",
      preheader: "계정의 이메일 주소가 변경되었습니다.",
      body: () =>
        p("계정의 이메일 주소가 변경되었습니다.") +
        info([
          ["이전 주소", "{{ .OldEmail }}"],
          ["현재 주소", "{{ .Email }}"],
        ]) +
        note(ALERT),
    },
    {
      key: "phone_changed_notification",
      subject: "Quest-On 전화번호가 변경되었습니다",
      assets: false,
      vars: ["Email", "OldPhone", "Phone"],
      title: "전화번호가 변경되었습니다",
      preheader: "계정의 전화번호가 변경되었습니다.",
      body: () =>
        p("계정의 전화번호가 변경되었습니다.") +
        info([
          ["계정", "{{ .Email }}"],
          ["이전 번호", "{{ .OldPhone }}"],
          ["현재 번호", "{{ .Phone }}"],
        ]) +
        note(ALERT),
    },
    {
      key: "mfa_factor_enrolled_notification",
      subject: "Quest-On 새 인증 수단이 추가되었습니다",
      assets: false,
      vars: ["FactorType", "Email"],
      title: "새 인증 수단이 추가되었습니다",
      preheader: "계정에 새 인증 수단이 추가되었습니다.",
      body: () =>
        p("계정에 새 인증 수단이 추가되었습니다.") +
        info([
          ["계정", "{{ .Email }}"],
          ["인증 수단", "{{ .FactorType }}"],
        ]) +
        note(ALERT),
    },
    {
      key: "mfa_factor_unenrolled_notification",
      subject: "Quest-On 인증 수단이 삭제되었습니다",
      assets: false,
      vars: ["FactorType", "Email"],
      title: "인증 수단이 삭제되었습니다",
      preheader: "계정의 인증 수단이 삭제되었습니다.",
      body: () =>
        p("계정에서 인증 수단이 삭제되었습니다.") +
        info([
          ["계정", "{{ .Email }}"],
          ["인증 수단", "{{ .FactorType }}"],
        ]) +
        note(ALERT),
    },
    {
      key: "identity_linked_notification",
      subject: "Quest-On 새 로그인 방식이 연결되었습니다",
      assets: false,
      vars: ["Provider", "Email"],
      title: "새 로그인 방식이 연결되었습니다",
      preheader: "계정에 새 로그인 방식이 연결되었습니다.",
      body: () =>
        p("계정에 새 로그인 방식이 연결되었습니다.") +
        info([
          ["계정", "{{ .Email }}"],
          ["로그인 방식", "{{ .Provider }}"],
        ]) +
        note(ALERT),
    },
    {
      key: "identity_unlinked_notification",
      subject: "Quest-On 로그인 방식 연결이 해제되었습니다",
      assets: false,
      vars: ["Provider", "Email"],
      title: "로그인 방식 연결이 해제되었습니다",
      preheader: "계정의 로그인 방식 연결이 해제되었습니다.",
      body: () =>
        p("계정에서 로그인 방식 연결이 해제되었습니다.") +
        info([
          ["계정", "{{ .Email }}"],
          ["로그인 방식", "{{ .Provider }}"],
        ]) +
        note(ALERT),
    },
  ];
}

/** 13종 전부. 기본은 라우트가 있는 환경(staging)용 `token_hash` 링크. */
export function buildTemplates(opts: { recoveryLink?: RecoveryLink } = {}): EmailTemplate[] {
  return specs(opts.recoveryLink ?? "token_hash").map((s) => ({
    key: s.key,
    subject: s.subject,
    vars: s.vars,
    html: layout({ title: s.title, preheader: s.preheader, body: s.body(), assets: s.assets }),
  }));
}

/** Supabase Management API 의 `mailer_*` 키 이름. */
export const supabaseKeys = (key: TemplateKey) => ({
  content: `mailer_templates_${key}_content`,
  subject: `mailer_subjects_${key}`,
});

const OUT_DIR = join(process.cwd(), "docs", "email-templates");

function write(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const main = buildTemplates();
  const subjects: Record<string, string> = {};
  for (const t of main) {
    writeFileSync(join(OUT_DIR, `${t.key}.html`), t.html);
    subjects[t.key] = t.subject;
  }
  const legacy = buildTemplates({ recoveryLink: "confirmation_url" }).find((t) => t.key === "recovery");
  if (legacy) writeFileSync(join(OUT_DIR, "recovery.legacy.html"), legacy.html);
  writeFileSync(join(OUT_DIR, "subjects.json"), JSON.stringify(subjects, null, 2) + "\n");
  console.log(`wrote ${main.length} templates + recovery.legacy.html + subjects.json → docs/email-templates/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "write") write();
  else {
    console.error("usage: tsx scripts/auth-email-templates.ts write");
    process.exit(1);
  }
}
