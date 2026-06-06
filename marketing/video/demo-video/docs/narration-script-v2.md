# Narration Script v2 — 10-Beat Structure (60-70s)

For ElevenLabs `eleven_multilingual_v2` (or v3), Harry · Calm Narrator
(or whichever voice you keep). Same voice direction as before:

```
Calm institutional Korean female/male narrator, mid-low pitch, slow
controlled pacing, quiet authority. Premium B2B brand film tone —
Apple keynote Korean dub / SBS documentary narration. No emotional
swings, no sales energy. Each sentence breathes. Light pause after
commas. Slight emphasis on accent words. Avoid robotic monotone.
```

> **Fix from v1**: do NOT start a line with bare "AI" — the "A" gets
> clipped and becomes hard to understand. Lines below either avoid
> starting with AI, or put a tiny lead-in word ("이제", "그리고") first.

---

## ★ DECISION NEEDED — Core phrase (Beat 1 + Beat 2)

This is the heart of the film. Your proposed nuance was "학생들의 AI
사용은 이미 막을 수 없습니다. 하지만 이를 막는 것이 과연 옳은 일일까요?"
— you felt it lacked impact. Here are 3 stronger versions, split across
two beats (cheating-student visual → blackbox forms). **Pick one before
running ElevenLabs.**

### Option A — closest to your version, tightened (recommended)
```
Line 1 (over cheating-student visual):
  학생들의 AI 사용은, 이미 막을 수 없습니다.

Line 2 (over blackbox forming):
  막을 수 없다면 — 막는 것이, 정말 옳은 일일까요?
```

### Option C — the "we never even asked" angle (most provocative)
```
Line 1:
  학생들의 AI 사용은, 막을 수 없습니다.

Line 2:
  막아야 하는지조차 — 우리는, 묻지 않았습니다.
```

### Option D — rhetorical escalation
```
Line 1:
  이미 막을 수 없습니다. 학생들의 AI 사용은.

Line 2:
  그런데 — 막는 것이, 정말 답일까요?
```

My pick: **Option A**. The two clauses get their own visual moment
(cheating reality → opaque box), so the question lands with weight.

---

## Full 10-line script

Generate each line as a separate audio file. The composition places
each at its beat. Target durations are guidelines, not hard caps.

| # | Beat | File | Target | Line (Option A core; swap Lines 1-2 if you pick C/D) |
|---|---|---|---:|---|
| 1 | Cheating Student | `v2-01-cheating.mp3` | 4.0s | 학생들의 AI 사용은, <break time="250ms"/> 이미 막을 수 없습니다. |
| 2 | Blackbox forms | `v2-02-blackbox.mp3` | 4.5s | 막을 수 없다면 — <break time="350ms"/> 막는 것이, 정말 옳은 일일까요? |
| 3 | Old Response | `v2-03-oldresponse.mp3` | 5.0s | 지금까지 우리는 — <break time="250ms"/> 금지하거나, 적발해 왔습니다. |
| 4 | Blackbox insight | `v2-04-insight.mp3` | 5.5s | 하지만 그렇게는, 학생이 어떻게 사고했는지 — <break time="200ms"/> 볼 수 없습니다. |
| 5 | Crack | `v2-05-crack.mp3` | 4.5s | Quest-On은, <break time="200ms"/> 이 블랙박스를 글래스박스로 바꿉니다. |
| 6 | Glassbox | `v2-06-glassbox.mp3` | 6.5s | 학생의 질문, 참조한 근거, 답안의 변화, <break time="200ms"/> 평가 기준이 — 모두 기록됩니다. |
| 7 | Product | `v2-07-product.mp3` | 6.0s | 교수자는 AI와 함께 출제하고, <break time="300ms"/> 학생은 허용된 범위 안에서 AI와 사고합니다. |
| 8 | Field Proof | `v2-08-proof.mp3` | 5.5s | 동국대, 홍익대, 숙명여대, 고려대 — <break time="300ms"/> 이미 현장에서 검증되고 있습니다. |
| 9 | Why Claim | `v2-09-why.mp3` | 5.0s | 이제 — <break time="250ms"/> AI 사용을 막는 대신, 활용 과정을 평가합니다. |
| 10 | Brand Lock | `v2-10-lock.mp3` | 2.5s | Quest-On. <break time="150ms"/> 대학 시험의 새 기준. |

### Plain versions (if ElevenLabs UI rejects `<break>` SSML — use ellipses/commas)

```
1.  학생들의 AI 사용은, … 이미 막을 수 없습니다.
2.  막을 수 없다면 — … 막는 것이, 정말 옳은 일일까요?
3.  지금까지 우리는 — … 금지하거나, 적발해 왔습니다.
4.  하지만 그렇게는, 학생이 어떻게 사고했는지 — … 볼 수 없습니다.
5.  Quest-On은, … 이 블랙박스를 글래스박스로 바꿉니다.
6.  학생의 질문, 참조한 근거, 답안의 변화, … 평가 기준이 — 모두 기록됩니다.
7.  교수자는 AI와 함께 출제하고, … 학생은 허용된 범위 안에서 AI와 사고합니다.
8.  동국대, 홍익대, 숙명여대, 고려대 — … 이미 현장에서 검증되고 있습니다.
9.  이제 — … AI 사용을 막는 대신, 활용 과정을 평가합니다.
10. Quest-On. … 대학 시험의 새 기준.
```

## Pronunciation notes
- Quest-On = "퀘스트온" (one phrase, no hyphen emphasis)
- 블랙박스 / 글래스박스
- 동국대 / 홍익대 / 숙명여대 / 고려대 — equal weight on each, no emphasis
- Line 9 "AI 사용을..." — there's a lead-in "이제 —" so the AI isn't at the
  very start; still ensure ElevenLabs leaves ~150ms of lead silence on
  every clip so nothing clips.

## Workflow
1. Pick core-line option (A / C / D) for Lines 1-2.
2. Generate each of the 10 lines (3 takes each, pick the most restrained).
3. Save into `assets/audio/vo/` with the `v2-NN-name.mp3` filenames above.
4. Send back to me — I'll silence-split if needed and wire each into the
   composition at its beat.

Total VO airtime ≈ 44s out of ~68s — plenty of breathing room.
