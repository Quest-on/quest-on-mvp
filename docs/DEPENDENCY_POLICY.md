# Dependency Policy

- No pre-release packages in production (current exception: `@base-ui-components/react` — to be replaced).
- Run `npm audit` before merging dependency updates.
- Prefer built-in or already-installed solutions over adding new packages.
- New packages require justification — check if existing deps already solve the problem first.

## PostHog integration (#357)

`posthog-js` and `posthog-node` are pinned stable official SDKs. Existing Vercel Analytics does not provide the selected PostHog project's shared anonymous/authenticated identity or ingestion contract. Use these SDKs instead of implementing a tracker, proxy, queue or retry framework. The prerelease `@posthog/next` is not used. Record the dependency audit in PR #358; do not run unrelated force upgrades.
