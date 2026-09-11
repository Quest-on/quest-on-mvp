# Website analytics on the current production release

PostHog Cloud is the website and product analytics service. EspoCRM owns outreach sends, replies and sales progress; native accounts remain the authoritative registration record. Company owner: yeongjun@quest-on.org. Project 604024, US region, Asia/Seoul timezone. Dashboard: https://us.posthog.com/project/604024/dashboard/2085781.

## Configuration

Set the public project token through the hosting environment, never a personal or secret API key:

```text
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<public project token>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_ENABLED=true
NEXT_PUBLIC_APP_ENV=production
```

Rebuild after public environment changes. Use APP_ENV=staging for validation and filter every business insight to environment=production. Missing/invalid configuration, development and test disable collection. The current Vercel login cannot write production-target environment variables; reauthentication and live ingestion verification remain pending.

## Current production scope

- `$pageview`: supported public and normalized application routes after analytics consent. Private route identifiers, unknown query fields and fragments are omitted.
- `signup_start`: same-origin signup link clicks, representing intent rather than a completed account.
- `signup_completed`: authenticated instructor accounts verified within 24 hours of creation and seen within 24 hours of verification. A deterministic UUID deduplicates repeated server captures. Delayed verification, late consent/role selection, blocking and delivery failure can leave gaps.
- Internal auth UUID links browser and server events; account changes/logout reset browser identity. Names, emails, answers and exam codes are excluded from event properties.

UTM keys source, medium, campaign, content and id accept lowercase campaign codes only. Next approved outreach batches can use utm_source=outreach, utm_medium=email and a batch code in utm_content. Existing sent emails are not edited.

The shared server helper understands milestone names, but this production port does not add an onboarding_events table or demo features. Those integrations exist in staging PR #358 and must wait for the underlying product release. Missing demo analytics is not evidence of no usage.

## Collection and reliability

The optional preference uses localStorage quest-on.analytics-choice.v2 and the same-origin quest_on_analytics cookie. The banner/settings control supports grant, deny and later withdrawal. The preference expires after one year; PostHog's selected Free plan has one-year event retention. The service uses pseudonymous account-linked analytics, not anonymous data.

Use official stable posthog-js and posthog-node. Autocapture, session replay, surveys, flags requests, automatic exception capture and performance capture are off. before_send uses an explicit property vocabulary. Server delivery uses Next after() with bounded requests; failures do not fail authentication. There is no retry queue or new database write. Vercel Web Analytics mounts are replaced; Speed Insights remains.

## Validation and release

Staging PR #358 passed CI and deployed. This separate main-based port follows the existing #356 production-port precedent: staging has hundreds of unrelated commits and DB differences, so a full promotion is outside analytics scope. Main review/CI gates remain in force.

Run type checking, lint and focused website/PostHog/auth tests. After authorized hosting access is restored, verify actual ingestion, no collection before consent or after withdrawal, single pageviews per navigation, sanitized URLs, correct identity transitions, server-confirmed signup and staging exclusion from production insights. SDK unit tests or an empty dashboard do not prove live collection.

Rollback by setting NEXT_PUBLIC_POSTHOG_ENABLED=false and rebuilding, or reverting the analytics PR. Preserve CRM and native account data.
