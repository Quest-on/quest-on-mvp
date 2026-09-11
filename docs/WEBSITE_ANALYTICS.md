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
| $pageview | Any application page template was viewed | Browser, sanitized navigation |
| $pageleave | Page exit, with SDK duration/scroll metrics when provided | Browser, native SDK |
| $autocapture | Click or form submission | Browser, native SDK; masked structure and safe internal destination |
| signup_start | A same-origin signup link was clicked | Browser; intent only |
| signup_completed | A new instructor or student account was email-verified and authenticated | Verified Supabase timestamps, server |
| intake_submitted | Instructor submitted onboarding intake | New native milestone row |
| demo_created | Instructor demo created | New native milestone row |
| demo_answered | Demo answer submitted | New native milestone row |
| demo_graded_viewed | Demo grade viewed; demo completion | New native milestone row |
| first_publish | Native first-publish milestone reached | New native milestone row |
| first_student_submission | Native first-student-submission reached | New native milestone row |

Signup is exported for instructor and student accounts verified within 24 hours of creation and authenticated within 24 hours of verification. Delayed verification, late role selection/consent and pre-existing accounts are not counted as new signups. Native account records remain the complete registration source. Server UUIDs are deterministic per environment, user and event so repeated captures have the same deduplication key.

Analytics are best-effort and consented, not a durable business ledger. Milestones export only on the original native insert; denied consent, background jobs without browser consent, ad blockers, network loss or failed ingestion can produce gaps. No queue/outbox or historical backfill is added. Do not infer zero signups or zero usage from an empty analytics report. Native outcomes can be compared in aggregate, but are not silently joined to anonymous visitors.

## Acquisition

Use non-personal campaign tags on the next approved batch:

```text
https://quest-on.app/?utm_source=espo&utm_medium=email&utm_campaign=professor_outreach_2026_09&utm_content=batch_005
```

Only lowercase letters, numbers, underscore and dash, up to 80 characters are accepted. UTM values must describe shared campaigns, never individuals. First public views and subsequent navigation carry the accepted campaign fields. Login identifies the existing anonymous browser with the internal auth UUID; logout/account changes reset identity. Cross-device journeys require identification on both devices.

## Collection controls

The root WebsiteAnalytics component owns the browser SDK. Explicit opt-in is stored in localStorage and a same-origin consent cookie; withdrawal stops capture and clears the prior SDK identity. The supported-page preference control remains accessible. Declining never blocks product features. The v3 preference renews earlier grants because the v2 disclosure excluded replay; previous refusals remain refused. Opt-out precedes recorder stop/reset so queued snapshots cannot flush after withdrawal.

Native click/form-submit autocapture and pageleave are enabled app-wide after consent. Native session replay is enabled with input/text masking, blocked media/editors, sanitized replay URLs and filtered DOM attributes. Classes and layout-only styles remain for playback. Copied text, surveys, feature flag evaluation, automatic exceptions, console logs, network payloads, canvas, heatmaps, dead/rage clicks and performance capture remain disabled. The SDK may fetch remote configuration and load its native recorder after consent. Replay snapshot envelopes use a separate property allowlist so the analytics scalar filter does not corrupt rrweb data. Recordings have 30-day retention in the project. The browser integration is global, not a signup-only funnel.

Page templates cover all App Router application pages, including assignments, grading, settings, profile and admin. Dynamic identifiers become `[id]`; static feature segments remain distinct. Authentication callback transport pages and unknown routes are omitted. A route coverage test fails when a new application page is not represented, preventing silent coverage drift.

Autocapture masks all text and element attributes at SDK initialization. The final filter additionally rebuilds native `$elements_chain` with tag/position and sanitized same-origin destination only: the SDK still adds hrefs and classes with masking enabled. This supports native click/submit analysis without sending form values, user-provided labels, answer/chat text, record IDs or arbitrary DOM attributes. Clicks and submits are intent, not proof that the server saved successfully; use native milestone events for observed successful outcomes. Browser before_send retains an explicit property vocabulary and sanitizes nested person properties. Unknown query fields, fragments, exam IDs/codes, answer text, names and email addresses are omitted. Server exports only event name, auth UUID, instructor role and environment, never arbitrary milestone metadata. The UI must describe this as pseudonymous account-linked analytics, not anonymous data.

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

Session replay reference: https://posthog.com/docs/session-replay/privacy.
