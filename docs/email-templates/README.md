# 인증 메일 템플릿

Supabase Auth 가 보내는 메일 13종(가입 인증번호·비밀번호 재설정·재인증·매직 링크·초대·이메일 변경·알림 7종)의 **원본**이다. 이 폴더의 HTML 은 생성물이다 — 고칠 때는 `scripts/auth-email-templates.ts` 를 고치고 다시 만든다.

```bash
npx tsx scripts/auth-email-templates.ts write
npx vitest run __tests__/auth-email-templates.test.ts
```

테스트가 (1) 이 폴더가 생성기 출력과 같은지, (2) 본문이 종류마다 허용된 변수만 쓰는지, (3) 본문의 유효 시간이 설정과 같은지, (4) 재설정 링크가 실제 라우트를 가리키는지 본다. 이 폴더를 손으로 고치면 (1)에서 깨진다.

**이 폴더는 원본일 뿐 배포가 아니다.** 템플릿은 Supabase 프로젝트 설정에 올라가 있고, 앱은 읽지 않는다. 올리는 일은 production 인증 설정을 바꾸는 명령이라 사람의 명시 승인이 있어야 한다.

## 환경별로 무엇을 쓰나

| 환경 | 템플릿 |
|---|---|
| staging | `*.html` 전부. 재설정 링크는 `/auth/recovery?token_hash=…` |
| production | 12종은 `*.html`, **재설정만 `recovery.legacy.html`** (기본 `{{ .ConfirmationURL }}` 링크) |

production 이 `recovery.legacy.html` 인 이유: production 에 `/auth/recovery` 가 아직 없다. 새 링크를 먼저 싣으면 `proxy.ts` 가 `/sign-in?redirect=…token_hash…` 로 보내 1회용 토큰이 주소에 실린다(2026-10-02 실측). 순서는 **라우트 배포 → 템플릿 교체 → 스위치**이고, 교체할 때 이 표의 production 줄이 `recovery.html` 로 바뀐다. `docs/SECURITY.md` 의 비밀번호 재설정 절 참조.

## 유효 시간 — 본문과 설정은 같이 바꾼다

본문의 "15분" 은 `mailer_otp_exp` = 900 (초)과 같아야 한다. 템플릿은 설정을 읽을 수 없어서 손으로 맞추는데, 예전엔 본문이 "5분", 설정이 3600초라 사용자가 실제와 다르게 안내받았다. `EXPIRY_MINUTES` 를 바꾸면 이 문서와 설정(`mailer_otp_exp`)도 같이 바꾼다 — 테스트가 상수와 이 문서를 대조한다. 이 값은 가입 인증번호뿐 아니라 재설정·매직 링크·초대·이메일 변경 링크 모두의 만료다.

## Supabase 에 올릴 때 (Management API)

`PATCH /v1/projects/{ref}/config/auth`. 바꾸는 키는 `mailer_templates_<종류>_content`, `mailer_subjects_<종류>`, `mailer_otp_exp` 뿐이다(`subjects.json` 이 제목).

1. **프로젝트를 독립적으로 대조한다.** production ref ≠ staging ref 이고, 응답의 `site_url` 이 기대한 도메인인지 본다. 한 환경의 토큰으로 다른 환경을 바꾸는 사고가 이 작업에서 가장 쉽다.
2. **바꾸기 전 `GET` 으로 전체 설정을 백업**한다. 백업에는 `smtp_pass`(해시) 같은 값이 있으니 끝나면 지운다.
3. **PATCH 본문에는 실제로 달라지는 키만** 싣는다. **`smtp_*` 를 보내지 않는다** — `GET` 이 돌려주는 `smtp_pass` 는 64자 해시라, 백업 값을 되돌려 보내면 SMTP 비밀번호가 그 문자열로 덮여 모든 메일이 깨진다. 이 때문에 SMTP 설정은 롤백이 안 된다(새 키를 발급해 앞으로 고친다).
4. **PATCH 후 `GET` 으로 백업과 대조**한다. 바뀐 키가 보낸 키와 정확히 같아야 한다. 단 `mailer_subjects_custom_contents`·`mailer_templates_custom_contents` 는 서버가 계산하는 "커스텀 여부" 맵이라 템플릿을 처음 바꾸면 함께 바뀌는 게 정상이다.
5. **`GET` 에 보이는 것과 실제로 나가는 메일이 다를 수 있다.** 설정 조회에는 바로 보이는데 발송은 한동안 이전 템플릿으로 나갔다(2026-10-02 production, 3분 이상). 반영은 설정 조회가 아니라 **실제 발송으로** 확인한다.

## 실제 발송으로 확인할 때

수신 주소는 Resend 시뮬레이션 주소(`delivered+<태그>@resend.dev`)를 쓴다 — 실제 사람에게 가지 않는다. 종류별로 메일을 일으킨다: 가입(`/auth/v1/signup`), 재설정(`/recover`), 매직 링크(`/otp`), 재인증(`/reauthenticate`, 로그인 JWT 필요), 이메일 변경(`PUT /user`), 초대(`/admin/invite`). 재설정과 매직 링크는 같은 토큰 열을 쓰므로 서로 다른 사용자로 한다. 그다음 Resend `GET /emails/{id}` 의 `html` 로 제목·링크·변수 치환(`{{`·`<no value>` 가 남지 않았는지)을 본다. 끝나면 만든 사용자와 `profiles` 를 지우고 잔여 0건을 확인한다. 토큰·코드·링크 값은 출력하지 않는다.

**메일 한도를 아낀다.** `rate_limit_email_sent`(production 30/시간)는 프로젝트 전체가 나눠 쓴다. 종류별 검증 한 바퀴가 7통이다. 반복 검증으로 실사용자의 가입 인증번호가 막히지 않게, 확인은 한 통씩 간격을 두고 한다.

## 알려진 제약

- 알림 메일 7종(`*_notification`)은 production 에서 꺼져 있다(`mailer_notifications_*_enabled=false`). 템플릿은 있지만 발송 경로가 없어 실발송으로는 확인하지 못한다 — 린트(변수 허용 목록)만 건다. `.SiteURL` 이 알림 데이터에 있는지 확인되지 않아 로고와 주소 푸터를 뺐다.
- 로고는 `{{ .SiteURL }}/qlogo_icon.png`(`public/`)이다. 앱 로고는 SVG 인데 메일 클라이언트(Gmail 등)가 SVG 를 그리지 못한다. 이미지를 막는 클라이언트에서는 로고만 빠지고 `Quest-On` 글자는 남는다.
- 레이아웃은 표 기반·인라인 스타일이다. Outlook 데스크톱은 모서리 둥글림과 `max-width` 를 무시한다(내용은 정상).
