# Website and product analytics

PostHog Cloud is the website/product analytics service selected for #357. EspoCRM owns outreach history; native product records own actual accounts and milestones. This integration does not change the active email batch.

## Configuration

Company owner: yeongjun@quest-on.org. Project: Quest-On (US). Use the public project token from that project in the hosting environment, never a personal or secret API key.

```text
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<project token>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_ENABLED=true
NEXT_PUBLIC_APP_ENV=staging
```

Production sets NEXT_PUBLIC_APP_ENV=production. Development and test are always disabled. Public environment changes require a rebuild. One project can receive both environments, but every production dashboard must filter environment=production. Staging events are validation data, not business results.

Stable official posthog-js/posthog-node versions are pinned in package.json. No custom proxy, collector, database migration or polling service is introduced. Vercel Web Analytics mounts and the unshipped GA4 code are replaced; Vercel Speed Insights remains a separate performance measurement already present in the app.

## Events and interpretation

| Event | Meaning | Source |
|---|---|---|
| $pageview | A supported page was viewed | Browser, manual sanitized navigation |
| signup_start | A same-origin signup link was clicked | Browser; intent only |
| signup_completed | A new instructor account was email-verified and authenticated | Verified Supabase timestamps, server |
| intake_submitted | Instructor submitted onboarding intake | New native milestone row |
| demo_created | Instructor demo created | New native milestone row |
| demo_answered | Demo answer submitted | New native milestone row |
| demo_graded_viewed | Demo grade viewed; demo completion | New native milestone row |
| first_publish | Native first-publish milestone reached | New native milestone row |
| first_student_submission | Native first-student-submission reached | New native milestone row |

Signup is exported only for instructor accounts verified within 24 hours of creation and authenticated within 24 hours of verification. Delayed verification, late role selection/consent and pre-existing accounts are not counted as new signups. Native account records remain the complete registration source. Server UUIDs are deterministic per environment, user and event so repeated captures have the same deduplication key.

Analytics are best-effort and consented, not a durable business ledger. Milestones export only on the original native insert; denied consent, background jobs without browser consent, ad blockers, network loss or failed ingestion can produce gaps. No queue/outbox or historical backfill is added. Do not infer zero signups or zero usage from an empty analytics report. Native outcomes can be compared in aggregate, but are not silently joined to anonymous visitors.

## Acquisition

Use non-personal campaign tags on the next approved batch:

```text
https://quest-on.app/?utm_source=espo&utm_medium=email&utm_campaign=professor_outreach_2026_09&utm_content=batch_005
```

Only lowercase letters, numbers, underscore and dash, up to 80 characters are accepted. UTM values must describe shared campaigns, never individuals. First public views and subsequent navigation carry the accepted campaign fields. Login identifies the existing anonymous browser with the internal auth UUID; logout/account changes reset identity. Cross-device journeys require identification on both devices.

## Collection controls

The root WebsiteAnalytics component owns the browser SDK. Explicit opt-in is stored in localStorage and a same-origin consent cookie; withdrawal stops capture and clears the prior SDK identity. The supported-page preference control remains accessible. Declining never blocks product features.

Autocapture, pageleave, recordings, surveys, flags requests, automatic exceptions and performance capture are disabled initially. Browser before_send retains an explicit property vocabulary and sanitizes nested person properties. Unknown query fields, fragments, exam IDs/codes, answer text, names and email addresses are omitted. Server exports only event name, auth UUID, instructor role and environment, never arbitrary milestone metadata. The UI must describe this as pseudonymous account-linked analytics, not anonymous data.

## Dashboard

Create one Outreach and activation dashboard with production filters on all tiles:

- Daily unique website visitors and campaign/UTM-content breakdown.
- Unique instructors completing signup, demo creation and demo completion.
- A sequential pageview -> signup_completed -> demo_created -> demo_graded_viewed funnel, using a seven-day conversion window.

Web views do not count as CRM replies or interested conversations. CRM remains the response KPI source. A funnel with consent-dependent tracking is an observed conversion funnel, not the denominator for all emails sent.

## Validation and rollback

Run in the product worktree, with the same commands on PowerShell and POSIX shells:

```text
npx tsc --noEmit
npm run lint
npx vitest run __tests__/website-analytics.test.ts __tests__/posthog.test.ts __tests__/onboarding-events.test.ts __tests__/auth-profile-provisioning.test.ts __tests__/auth-last-seen.test.ts
npm audit
```

Use CI for DB-backed tests. On staging verify no capture before consent or after refusal, one pageview per navigation, safe UTM payloads, identity reset, actual backend milestone ingestion, and separation from production dashboard totals. Repeat ingestion checks after the reviewed staging-to-main deployment. A configured project or successful HTTP response alone is not proof that the application is collecting live events.

Rollback: set NEXT_PUBLIC_POSTHOG_ENABLED=false and rebuild through the normal deployment workflow, or revert this PR. Do not alter CRM sending or native account/milestone records. The main branch's approval gate remains in force.

Official references: https://posthog.com/docs/libraries/next-js, https://posthog.com/docs/libraries/js/config, https://posthog.com/docs/libraries/node.
