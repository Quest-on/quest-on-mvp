# Narration Script — 60s Korean VO (ElevenLabs)

Plain-text Korean voiceover lines with target timing. Generate each line
as a separate audio file via ElevenLabs `eleven_multilingual_v2`.

## Voice direction (paste into ElevenLabs voice description / style notes)

```
Calm institutional Korean female narrator, mid-low pitch, slow controlled
pacing, quiet authority. Premium B2B brand film tone — like an Apple
keynote Korean dub or an SBS documentary narrator. No emotional swings,
no warmth excess, no sales energy. Each sentence breathes. Light pause
after commas. Slight emphasis on accent words: 시험 안에, 보이지 않는다,
활용 과정. Avoid robotic monotone.
```

## Recommended ElevenLabs settings

- Model: `eleven_multilingual_v2` (or v3 if available for Korean)
- Stability: 38–45
- Style: 5–15
- Speaker boost: ON
- Output format: mp3_44100_128

## 8 lines — copy each one separately into ElevenLabs

> **NOTE on `<break time="…"/>` tags:** ElevenLabs supports SSML-style
> break tags inline. If the UI doesn't accept them, replace with simple
> commas/ellipses for similar pauses.

---

### Line 1 — start 0:05.0, target 5.5s

**File:** `assets/audio/vo/01-old-response.mp3`

```
AI는 이미 시험 안에 들어왔습니다. <break time="400ms"/> 그런데 우리는, 여전히 금지하거나 적발하려고만 합니다.
```

Plain version (no SSML):
```
AI는 이미 시험 안에 들어왔습니다. … 그런데 우리는, 여전히 금지하거나 적발하려고만 합니다.
```

---

### Line 2 — start 0:11.5, target 6.0s

**File:** `assets/audio/vo/02-blackbox.mp3`

```
진짜 문제는 AI를 썼다는 사실이 아니라, <break time="300ms"/> 그 과정이 보이지 않는다는 것입니다.
```

Plain:
```
진짜 문제는 AI를 썼다는 사실이 아니라, … 그 과정이 보이지 않는다는 것입니다.
```

---

### Line 3 — start 0:19.5, target 4.5s ★

**File:** `assets/audio/vo/03-crack.mp3`

> Lands ~1s after the sub-bass impact at 0:18.5. Slightly more decisive
> tone than the others.

```
Quest-On은 <break time="150ms"/> 이 블랙박스를, <break time="250ms"/> 글래스박스로 바꿉니다.
```

Plain:
```
Quest-On은 … 이 블랙박스를, … 글래스박스로 바꿉니다.
```

> **Pronunciation:** Quest-On = "퀘스트온" (single phrase, no hyphen
> emphasis). Blackbox = "블랙박스". Glassbox = "글래스박스".

---

### Line 4 — start 0:25.5, target 6.5s

**File:** `assets/audio/vo/04-glassbox.mp3`

```
학생의 질문, 참조한 근거, 답안의 변화, <break time="200ms"/> 평가 기준이 모두 기록됩니다.
```

Plain:
```
학생의 질문, 참조한 근거, 답안의 변화, … 평가 기준이 모두 기록됩니다.
```

---

### Line 5 — start 0:33.5, target 6.0s

**File:** `assets/audio/vo/05-product.mp3`

```
교수자는 AI와 함께 출제하고, <break time="300ms"/> 학생은 허용된 범위 안에서 AI와 사고합니다.
```

Plain:
```
교수자는 AI와 함께 출제하고, … 학생은 허용된 범위 안에서 AI와 사고합니다.
```

---

### Line 6 — start 0:40.5, target 5.0s

**File:** `assets/audio/vo/06-proof.mp3`

```
동국대, 홍익대, 숙명여대. <break time="300ms"/> 이미 현장에서 검증되고 있습니다.
```

Plain:
```
동국대, 홍익대, 숙명여대. … 이미 현장에서 검증되고 있습니다.
```

> **Pronunciation:** 동국대 = "동국대", 홍익대 = "홍익대", 숙명여대 =
> "숙명여대". Each named with equal weight, no emphasis on any one.

---

### Line 7 — start 0:48.5, target 5.0s ★ THE WHY CLAIM

**File:** `assets/audio/vo/07-why.mp3`

> The most important line of the film. Slightly slower delivery, slight
> downward pitch on "평가합니다".

```
AI 사용을 막는 대신, <break time="400ms"/> 활용 과정을 평가합니다.
```

Plain:
```
AI 사용을 막는 대신, … 활용 과정을 평가합니다.
```

---

### Line 8 — start 0:57.5, target 2.5s

**File:** `assets/audio/vo/08-lock.mp3`

```
Quest-On. <break time="150ms"/> 대학 시험의 새 기준.
```

Plain:
```
Quest-On. … 대학 시험의 새 기준.
```

> Final line. Confident, calm, complete. Slight rest on "Quest-On" before
> the slogan.

---

## Workflow

1. For each line above, paste the SSML version (or plain version) into
   ElevenLabs.
2. Generate **3 takes per line**. Listen and pick the most institutional/
   restrained one.
3. Save into `assets/audio/vo/` with the exact filenames above.
4. Total VO airtime ≈ 41s out of 60s — leaves 19s of breathing room
   between lines.
5. After all 8 lines saved, the composition will pull them via `<audio>`
   tracks at the timings noted.

## Quality check after generation

- [ ] Pronunciation: Quest-On, 블랙박스, 글래스박스, 동국대, 홍익대, 숙명여대
- [ ] Pace: each line breathes; no rushed delivery
- [ ] Tone consistency across all 8 lines (same speaker setting, same emotional baseline)
- [ ] Line 7 lands with the most weight (the WHY claim)
- [ ] No file exceeds its target duration by more than 0.5s — if it does,
      either re-generate slightly faster or adjust composition timing
