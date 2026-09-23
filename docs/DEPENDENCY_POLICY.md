# Dependency Policy

- No pre-release packages in production (current exception: `@base-ui-components/react` — to be replaced).
- Run `npm audit` before merging dependency updates.
- Prefer built-in or already-installed solutions over adding new packages.
- New packages require justification — check if existing deps already solve the problem first.

## PostHog integration (#357)

`posthog-js` and `posthog-node` are pinned stable official SDKs. Existing Vercel Analytics does not provide the selected PostHog project's shared anonymous/authenticated identity or ingestion contract. Use these SDKs instead of implementing a tracker, proxy, queue or retry framework. The prerelease `@posthog/next` is not used. Record the dependency audit in PR #358; do not run unrelated force upgrades.

## `npm audit` 잔여 5건 — 도달 가능성 분석 (#187, 2026-09-23)

`npm audit` 은 5건(moderate 2 / high 3 / **critical 0**)을 보고한다. PR #440 이 49건 → 5건, critical 5 → 0 으로 줄인 뒤 남은 것들이다. **다섯 모두 게시된 상위 수정 버전이 없고, 도달 불가이거나 dev 전용이다.** 아래를 읽지 않고 `npm audit fix --force` 를 돌리면 다운그레이드가 적용된다.

### 사슬 1 — `exceljs` → `uuid` (moderate, 런타임 의존)

advisory [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): `uuid < 11.1.1` 의 **v3/v5/v6 에 `buf` 를 넘길 때** 버퍼 경계 검사가 없다.

**도달 불가다.** `exceljs` 가 `uuid` 를 쓰는 곳은 한 곳뿐이고 `v4` 를 **인자 없이** 부른다:

```js
// node_modules/exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js
const {v4: uuidv4} = require('uuid');
model.x14Id = `{${uuidv4()}}`.toUpperCase();
```

저장소도 `uuid` 를 직접 import 하지 않고, v3/v5/v6 사용처가 없다. 즉 취약 코드 경로에 들어가는 호출이 존재하지 않는다.

수정 버전도 없다 — advisory 범위가 `exceljs >= 3.5.0` 전체이고 설치본 `4.4.0` 이 **최신 게시 버전**이다. npm 이 제안하는 `exceljs@3.4.0` 은 다운그레이드다. 사용처는 `lib/exam-export-xlsx.ts` 하나다.

### 사슬 2 — `prisma` → `@prisma/config` → `deepmerge-ts` (high, **devDependency**)

advisory [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): `deepmerge-ts < 8.0.0` 이 재귀 객체 그래프를 병합할 때 스택을 소진한다.

**런타임에 없다.** `prisma` 는 CLI 이고 `devDependencies` 에 있다. 런타임 클라이언트는 별 패키지인 `@prisma/client`(`dependencies`)이고 audit 목록에 없다.

입력도 공격자 것이 아니다 — `@prisma/config` 는 이 병합을 **우리 설정 파일을 읽을 때** 쓴다:

```js
// node_modules/@prisma/config/dist/*.js
const { deepmerge } = await import("deepmerge-ts");
```

즉 빌드·마이그레이션 시점에 저장소 소유 파일을 병합하는 경로다.

수정 버전이 없다 — 취약 범위가 `prisma 6.13.0-dev.1 - 8.1.0-dev.4` 이고, 그걸 벗어나는 건 아직 게시되지 않았다(현재 최신은 `8.0.0-rc.15`, 여전히 범위 안이며 RC 다). 설치본은 `6.19.3` 이고 npm 제안 `6.12.0` 은 다운그레이드다.

### 다시 확인하는 방법

```bash
npm audit --json | node -e "…"        # severity 와 range
npm view exceljs version              # 최신이 설치본과 같은지
npm view prisma version               # 취약 범위를 벗어난 stable 이 나왔는지
grep -rn "uuid" node_modules/exceljs/lib --include=*.js
```

**상위가 고쳐지면 올린다.** `prisma` 가 `deepmerge-ts >= 8` 을 물고 stable 을 내면 바로 올린다. `npm overrides` 로 강제 승격하는 방법도 있지만, 도달 불가한 advisory 를 위해 상위 패키지가 검증하지 않은 major 를 밀어 넣는 거래라 하지 않는다 — 깨지면 마이그레이션과 엑셀 내보내기가 조용히 망가진다.
