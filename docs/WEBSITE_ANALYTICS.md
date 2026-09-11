# Website acquisition measurement

This change addresses #357. Runtime code is the source of truth. The integration is not live until the stream settings, deployment, and browser collection below are verified.

## Responsibilities

| System | What it establishes |
|---|---|
| GA4 Standard | Consented public-page visits and campaign acquisition; `signup_start` is intent, not completed registration |
| Vercel Analytics | Existing anonymous page metrics, now mounted once at the root, with query strings and dynamic identifiers removed |
| Existing product data | Actual profiles and the `onboarding_events` milestones, including demo completion and first student submission |
| EspoCRM | Sent, bounced, clicked, actual replies, leads, and follow-up tasks |

Do not count opens, clicks, pageviews, or signup clicks as professor responses. Anonymous visits do not identify a professor. Do not send email addresses, user IDs, exam codes, answers, or private page titles to GA4. Private application paths disable the GA4 tag and are excluded from its explicit events.

## Account and stream setup

Use a team-controlled GA4 Standard property named `Quest-On`, web stream `https://quest-on.app`, reporting timezone Asia/Seoul, currency KRW. Confirm whether an existing property exists before creating another. The proposed owner is apple021104@gmail.com; confirm actual account access and ownership. A company account can be granted access later according to the owner's instructions.

Production variables, set only after stream configuration:

```text
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-<actual measurement id>
NEXT_PUBLIC_GA4_ENABLED=true
```

The measurement ID is a public identifier, not an API secret. Leave both unset on previews and developer machines. Use a separate test stream if enabling tracking on staging. This implementation adds no npm package or database migration.

Configure the stream **before enabling the tag**:

1. Disable Enhanced Measurement entirely for the initial rollout. It can send history pageviews independently of `send_page_view:false`, and can collect forms, search terms, outgoing URLs and downloads outside this implementation's allowlist.
2. Keep Google Signals, advertising personalization, user-provided data collection, and advertising product links disabled. The code also disables advertising consent/signals.
3. Add no User-ID. Avoid an IP exclusion for the whole campus, which would remove legitimate prospects. Use a separately verified internal-traffic definition only for known team traffic and first keep the filter in Testing.
4. Do not mark `signup_start` as the completed-signup key event. Existing product milestones remain the source of truth until a separately validated registration/activation event bridge exists.
5. Use Traffic acquisition with session source/medium and session campaign. Create a public-page exploration from home to signup page to `signup_start`; this is an intent funnel, not a completed-registration funnel.

## Campaign links

For the next approved batch use a shared, non-personal convention:

```text
https://quest-on.app/?utm_source=espo&utm_medium=email&utm_campaign=professor_outreach_2026_09&utm_content=batch_005
```

Values are lowercase letters, numbers, `_` and `-`, maximum 80 characters. Never put a professor's name, email, school/person identifier, or private CRM contact ID in UTMs. The code sends allowlisted campaign fields and a clean page URL. Current active batches are not changed by this code. Untagged historical visits cannot be retrospectively attributed.

## Consent and coverage

The existing anonymous Vercel metric remains separate from optional GA4 cookies. GA4 is loaded only for a configured stream and an explicit browser choice on public pages. Declining leaves site functionality available; the public-page preference button allows changing that choice. Storage failures must not break navigation or login. No preference UI is shown until GA4 is enabled.

Public pages are enumerated in `lib/website-analytics.ts`. New marketing routes must be added intentionally. Vercel product routes are grouped at the top-level family to avoid leaking record IDs; unknown routes and admin pages are dropped. This changes path-level reporting granularity intentionally.

Review the published cookie/privacy information against the chosen Google property configuration before production release. The pre-existing cookie page mentions `analytics_id` and a future settings control; that text predates this integration and must not be treated as proof of an existing GA4 deployment.

## Verification and rollback

Local checks (PowerShell or POSIX shell, product worktree):

```text
npx tsc --noEmit
npm run lint
npx vitest run __tests__/website-analytics.test.ts __tests__/i18n-config.test.ts
```

Do not load production environment files or run DB-backed local browser tests. In a staging deployment connected to a test stream, verify via browser network tools and GA4 DebugView/Realtime:

- Before consent and after declining, no Google tag or GA collection request.
- After allowing, one public `page_view`; navigating to signup adds one, not two. Reload and client navigation both work.
- Test URL `?utm_source=espo&utm_medium=email&utm_campaign=qa&utm_content=qa&email=private@example.test#secret` produces only the clean URL and allowed campaign fields; inspect network payloads.
- A signup link emits `signup_start`; failed auth or merely opening the signup page does not emit `sign_up`.
- No exam/admin URLs, codes, names, answers, or form contents appear in requests. Changing to a private route disables GA events.
- Declining after allowing stops subsequent collection. Confirm the preference survives reload and that login still works.
- Repeat on production after the reviewed staging-to-main promotion. Realtime/DebugView proof is required before reporting setup complete; standard reports can lag.

Rollback: set `NEXT_PUBLIC_GA4_ENABLED=false` and redeploy the previously verified release or revert the analytics PR through the usual staging/main flow. Client-public environment values require a rebuild. Do not change CRM sending or product event data as part of rollback.

## Official references

- [GA4 Standard](https://marketingplatform.google.com/about/analytics/)
- [Manual pageviews and duplicate history events](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Campaign URL parameters](https://support.google.com/analytics/answer/10917952)
