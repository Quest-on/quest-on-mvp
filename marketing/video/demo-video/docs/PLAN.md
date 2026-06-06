# Quest-On Launch — 60s Storyboard Plan

This file is the source of truth for the 60-second hybrid ad: hyperframes
(HTML+GSAP) for Korean copy, UI, proof, and brand lock — fal HappyHorse
for cinematic blackbox→glassbox metaphor — Suno for score — ElevenLabs
for Korean voiceover.

Companion docs:

- `brand.md` — palette, typography, slogan, forbidden tropes
- `happyhorse-rules.md` — fal generation rules, prompts, lessons
- `ai-video-research.md` — model landscape decision (HappyHorse-1.0 etc.)
- `storyboard-original.md` — 11-beat 60s original storyboard

## Composition Settings

- Resolution: **1920 × 1080**
- Frame rate: **24 fps** (matches fal native; cleanest video sampling)
- Duration: **60 seconds = 1440 frames**
- Audio bed: 1 music track + 8 VO clips, mixed in composition

## 9-Beat Structure

| # | Beat            | Time         | Length | Source           | Visual                                                    | Copy / UI                                              | VO                                                                                | Sound                                                  |
| - | --------------- | ------------ | ------ | ---------------- | --------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1 | Cold Open       | 0:00 - 0:05  | 5s     | fal hook-void    | particles drift; cube shadow condenses                    | (none)                                                 | (silence)                                                                         | sub-bass swell, room                                   |
| 2 | Old Response    | 0:05 - 0:11  | 6s     | hyperframes      | Two X-cards (금지 / 사후 적발)                          | "지금까지 우리는 ~~금지하거나, 적발했습니다~~"        | "AI는 이미 시험 안에 들어왔습니다. 그런데 우리는, 여전히 금지하거나 적발하려고만 합니다." | piano motif enters                                     |
| 3 | Blackbox        | 0:11 - 0:18  | 7s     | fal blackbox     | Slow dolly-in on graphite cube                            | (last 1.5s) "최종 답안만 보입니다" + BLACKBOX label  | "진짜 문제는 AI를 썼다는 사실이 아니라, 그 과정이 보이지 않는다는 것입니다."         | tone hold                                              |
| 4 | The Crack ★     | 0:18 - 0:25  | 7s     | fal crack        | cobalt point → crack → glass interior visible             | (post-impact) "Blackbox → Glassbox"                    | "Quest-On은 이 블랙박스를, 글래스박스로 바꿉니다."                                | **0:18.5 sub-bass impact + crystalline shatter**       |
| 5 | Glassbox        | 0:25 - 0:33  | 8s     | fal orbit        | glass cube orbit + 4 labels staggered                    | PROMPT → SOURCE → REVISION → RUBRIC                    | "학생의 질문, 참조한 근거, 답안의 변화, 평가 기준이 모두 기록됩니다."             | warm cobalt pad swell                                  |
| 6 | Product Glimpse | 0:33 - 0:40  | 7s     | hyperframes + UI | split: 교수 출제 화면 / 학생 응시 화면                   | micro-labels: "AI와 출제 / 허용 범위 응시"              | "교수자는 AI와 함께 출제하고, 학생은 허용된 범위 안에서 AI와 사고합니다."         | crescendo                                              |
| 7 | Field Proof     | 0:40 - 0:48  | 8s     | hyperframes      | 3 verified cards: 동국대 · 홍익대 · 숙명여대             | metrics under each (강의·인원·시간 단축)              | "동국대, 홍익대, 숙명여대 — 이미 현장에서 검증되고 있습니다."                     | hold                                                   |
| 8 | Why Claim       | 0:48 - 0:56  | 8s     | hyperframes      | full-screen claim with gradient glow                     | "~~AI 사용을 막는~~ 대신, **활용 과정을 평가합니다**." | "AI 사용을 막는 대신, 활용 과정을 평가합니다."                                    | resolve to wide chord                                  |
| 9 | Brand Lock      | 0:56 - 1:00  | 4s     | hyperframes      | Quest-On wordmark + rule + tagline + URL                 | "AI 시대 대학 시험의 새 기준" / `QUEST-ON.APP`         | "Quest-On. 대학 시험의 새 기준." (last 2s)                                        | sustained pad → fade                                   |

★ = signature moment. fal video + Suno sub-bass + ElevenLabs VO line all
align at **0:18.5**. Get this right or the whole film loses its spine.

## Transition Decisions

| Boundary  | Type                       | Length | Intent                                                |
| --------- | -------------------------- | -----: | ----------------------------------------------------- |
| 1 → 2     | blur crossfade             | 0.5s   | continuity into copy beat                             |
| 2 → 3     | dip-to-black               | 0.4s   | cleanest mode-shift hyperframes → video               |
| 3 → 4     | invisible match-cut        | 0.2s   | both clips have cube center; preserve continuity      |
| 4 → 5     | invisible match-cut        | 0.3s   | crack reveals glass; clip 5 starts on glass cube      |
| 5 → 6     | blur crossfade + bg desat  | 0.7s   | most important — video → product UI handoff          |
| 6 → 7     | gentle blur dip            | 0.5s   | UI → proof cards                                      |
| 7 → 8     | zoom-through (climax)      | 0.45s  | escalation into Why claim                             |
| 8 → 9     | gentle blur dip            | 0.6s   | claim → lock                                          |

## Audio Map

### Music (Suno, see `docs/ai-video-research.md` and prompt below)

```
[Instrumental, no vocals]
60-second cinematic institutional minimalism for a premium B2B SaaS ad.
University assessment platform. Trustworthy, serious, calm, restrained
— Hans Zimmer minimalism crossed with Brian Eno atmosphere and modern
cobalt synth pads. Tempo around 80 BPM.

Structure:
[0:00-0:05] Sparse cobalt synth pad. Distant low rumble. A single high
piano note at 0:04.
[0:05-0:18] Restrained sub-piano motif enters at 0:05. Single-note
rhythm. Cobalt synth pad sustains underneath. Slow tension build.
[0:18-0:19] SUB-BASS IMPACT plus crystalline shatter sound. Single hit.
Then immediate breath of silence for half a beat.
[0:19-0:33] Tension releases. Warm cobalt synth swell. Slow piano
ascent. Hopeful but still contained.
[0:33-0:48] Continued ascent. Slightly warmer pads layer in. Strings
sustain in background, never leading. Gentle crescendo.
[0:48-0:56] Resolve to wide major chord. Confident, calm, complete.
[0:56-1:00] Final sustained pad note. Gentle fade.

Strict exclusions: NO drums, NO percussion beats, NO vocals,
NO sound effects beyond the 0:18 impact, NO EDM build-ups, NO
cinematic trailer hits, NO orchestral bombast. Subtle texture only.
The track must feel like an Apple keynote score crossed with a
high-end university brand film. Mix should leave clean midrange space
for spoken Korean voiceover.
```

Save winner to `assets/audio/score-suno.mp3`.

### Voice (ElevenLabs `eleven_multilingual_v2`)

Voice direction:

> Calm institutional Korean female narrator, mid-low pitch, slow
> controlled pacing, quiet authority. Premium B2B brand film tone —
> like Apple keynote Korean dub or SBS documentary narration. No
> emotional swings, no warmth excess, no sales energy. Each sentence
> breathes. Light pause after commas. Slight emphasis on accent words:
> "시험 안에", "보이지 않는다", "활용 과정". Avoid robotic monotone.

Settings: `stability` 35-50 / `style` 0-15 / `speaker_boost` on.

Lines (also in `assets/audio/vo/` after generation):

| #   | Start  | Length | File                       | Copy                                                                                                |
| --- | -----: | -----: | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | 0:05.0 |   5.5s | `01-old-response.mp3`      | AI는 이미 시험 안에 들어왔습니다. <break time="400ms"/> 그런데 우리는, 여전히 금지하거나 적발하려고만 합니다. |
| 2   | 0:11.5 |   6.0s | `02-blackbox.mp3`          | 진짜 문제는 AI를 썼다는 사실이 아니라, <break time="300ms"/> 그 과정이 보이지 않는다는 것입니다.        |
| 3   | 0:19.5 |   4.5s | `03-crack.mp3`             | Quest-On은 <break time="150ms"/> 이 블랙박스를, <break time="250ms"/> 글래스박스로 바꿉니다.            |
| 4   | 0:25.5 |   6.5s | `04-glassbox.mp3`          | 학생의 질문, 참조한 근거, 답안의 변화, <break time="200ms"/> 평가 기준이 모두 기록됩니다.              |
| 5   | 0:33.5 |   6.0s | `05-product.mp3`           | 교수자는 AI와 함께 출제하고, <break time="300ms"/> 학생은 허용된 범위 안에서 AI와 사고합니다.          |
| 6   | 0:40.5 |   5.0s | `06-proof.mp3`             | 동국대, 홍익대, 숙명여대. <break time="300ms"/> 이미 현장에서 검증되고 있습니다.                       |
| 7   | 0:48.5 |   5.0s | `07-why.mp3`               | AI 사용을 막는 대신, <break time="400ms"/> 활용 과정을 평가합니다.                                     |
| 8   | 0:57.5 |   2.5s | `08-lock.mp3`              | Quest-On. <break time="150ms"/> 대학 시험의 새 기준.                                                |

Tighten or stretch per ElevenLabs render — durations above are targets,
not hard caps. The composition's GSAP timeline reads each `<audio>`
duration and adjusts the bar.

## Lower-Third Readability (text on video clips)

For beats 3, 4, 5 (text on top of fal footage):

- Add a `radial-gradient(ellipse at bottom, rgba(5,7,15,0.78) 0%, rgba(5,7,15,0) 60%)` ground at the bottom 30%
- Pretendard 600-700 weight at 56-72px
- `text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7), 0 0 24px rgba(5, 7, 15, 0.45)`
- Entrance: 0.6s power3.out — exit absorbed by transition
- Line height 1.18, letter-spacing -0.02em

## Implementation Phases

| Phase | Step                                                                     | Owner       | Duration     |
| ----- | ------------------------------------------------------------------------ | ----------- | ------------ |
| 1     | Project init, folder, docs, fonts                                        | (this turn) | 10 min       |
| 1     | Pretendard `.woff2` + `@font-face`                                       | (this turn) | 5 min        |
| 1     | `scripts/generate-happyhorse-batch.mjs` ready to run                     | (this turn) | 15 min       |
| 2     | fal 5-clip batch generate                                                | user (FAL_KEY) | 30-60 min |
| 3     | Match-cut frame extraction + visual review                               | (next turn) | 10 min       |
| 4     | Suno music gen × 4 variants, pick winner                                 | user        | 15-30 min    |
| 4     | ElevenLabs VO 8 lines × 3 takes, pick                                    | user        | 15-30 min    |
| 5     | `index.html` 9-beat composition + audio                                  | (next turn) | 1-2 hrs      |
| 6     | lint / validate / inspect / draft render                                 | (next turn) | 30 min       |
| 7     | Korean native VO review, final render                                    | user + Claude | 30 min     |
| 8     | License confirm (Suno Pro / ElevenLabs / fal) before public publish      | user        | 10 min       |

## Decisions Locked

- F: 24 fps composition (matches fal native)
- G: Project at `/Users/cigro/Yeongjun/quest-on/marketing/video/demo-video/`
- H: HappyHorse-1.0 via `queue.fal.run` (`alibaba/happy-horse/text-to-video`)
- I: Phase 1 starts immediately

## Open Items / Risks

- [ ] `FAL_KEY` not yet exported in shell — user must export before Phase 2
- [ ] `ELEVENLABS_API_KEY` not yet exported — user must export before VO phase
- [ ] Pretendard `.woff2` license: SIL Open Font License — commercial use OK, attribution courteous not required
- [ ] Suno Pro plan needed for commercial use — user to confirm
- [ ] Real product UI screenshots for Beat 6 not yet captured — capture script in `scripts/` or reuse existing `/scripts/capture-*` from main repo
- [ ] University proof permission — confirm 동국대/홍익대/숙명여대 are OK to name in external ad
