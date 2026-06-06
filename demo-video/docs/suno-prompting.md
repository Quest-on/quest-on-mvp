# Suno v5.5 Music Prompting — Quest-On Launch Score

Researched 2026-05-11. **Why previous attempts failed**: we relied on
`[0:18]` / `[0:48]` timestamp markers — Suno v5.5 silently ignores those.
The model has no clock-precise event trigger. Re-architected accordingly.

## Key Facts (verified from official + community sources)

- **Use Custom Mode**, not Simple. Simple caps at ~500 chars total.
- **Style of Music** field: up to ~1,000 chars (stay under 950).
- **Lyrics** field: up to 3,000-5,000 chars. Use `[Instrumental]`,
  `[Intro]`, `[Outro - Fade]`, `[End]` metatags here.
- **Timestamps DON'T WORK**: drop `[0:18]` etc. from prompts. They
  either get read as lyrics or silently dropped.
- **Negative prompts** belong at the **END of the Style field** for
  highest weight. Stack specifics: `"no drums, no kick, no snare,
  no hi-hat, no percussion, no rhythm section"` not just `"no drums"`.
- **60-second outputs aren't reliable from a single gen** — use the
  **Extend** feature: gen → click ⋮ on track → Extend from ~0:45 →
  add `[Outro - Fade]` → complete to 60s.
- **VO-friendly mix language** that actually moves the model:
  - `"doesn't compete with voice"`
  - `"wide stereo with empty center"`
  - `"low dynamic range"`
  - `"clean midrange"`

## Sub-bass impact at 0:18 — How to Achieve It Without Timestamps

Suno can't hit a precise moment, but you CAN encourage a single sub-bass
event by structural language:

- In Style: `"single deep sub-bass pulse near the midpoint"`
- In Lyrics: `[Mid-piece: deep sub-bass pulse]` as a metatag

Then in **post**, manually align the score's loudest sub-bass peak with
the visual crack moment in your video editor. Don't expect Suno to do it.

If no usable impact appears in any gen → record a 1-shot sub-bass + glass
shatter SFX (Splice, Artlist, or free sources) and layer in post.

---

## Prompt A — Genre-tag heavy (safest, run this first)

Paste into **Style of Music**:

```
ambient cinematic, Brian Eno-style pads, neo-classical, sparse piano, deep sub-bass texture, crystalline synth, wide major resolution, doesn't compete with voice, wide stereo with empty center, clean midrange, low dynamic range, unobtrusive background score, sparse arrangement, 60 seconds, instrumental only, no vocals, no drums, no kick, no snare, no hi-hat, no percussion, no rhythm section, no beat, beatless, no trailer hits, no EDM build
```

Paste into **Lyrics** (uses metatags only):

```
[Instrumental]
[Intro - Sparse cobalt synth pad and distant low rumble]
[Mid-piece - Deep sub-bass pulse, single hit, then breath of silence]
[Resolution - Wide major chord, calm and complete]
[Outro - Fade]
[End]
```

Title: `Quest-On Launch Score 60s`

Instrumental toggle: **ON**

---

## Prompt B — Cinematic descriptive (use if A is too sparse/cold)

Paste into **Style of Music**:

```
Premium 60-second institutional underscore. Calm authority mood: slow-evolving Brian Eno-style atmospheric pads layered with sparse neo-classical piano notes and a single deep sub-bass pulse near the midpoint. Resolves into a wide, open major chord near the end. Mix is clean and open in the midrange, sparse arrangement, low dynamic range, unobtrusive background score, doesn't compete with voice, wide stereo with empty center. Instrumental only, no vocals, no drums, no kick, no snare, no percussion, no rhythm section, no trailer impacts, no orchestral bombast, no EDM elements.
```

Same Lyrics metatags as Prompt A.

---

## Prompt C — Reference-track style (use if A and B drift modern)

Paste into **Style of Music**:

```
in the style of Brian Eno "An Ending (Ascent)", Hans Zimmer "Time" (Inception), Max Richter "On the Nature of Daylight" — slow evolving pads, minimal piano, deep sub-bass texture, wide harmonic resolution, cinematic ambient, warm open mix, clean midrange pocket, doesn't compete with voice, wide stereo with empty center, 60 second institutional score, instrumental, no vocals, no drums, no percussion, no rhythm section
```

Same Lyrics metatags as Prompt A.

---

## Workflow (do this for each prompt)

1. Suno → New Song → **Custom Mode**
2. Toggle **Instrumental** ON
3. Paste Style of Music + Lyrics + Title
4. **Generate 4 variations**
5. Listen. Score each on:
   - Does it feel institutional, not melodic?
   - Is the midrange clean (could a voice sit on top)?
   - Does ANY sub-bass moment exist around the middle?
   - Is the resolution at the end wide and confident?
6. If all 4 fail → escalate prompt with recovery tactics below
7. If 1 passes → **Extend** to fix length: click ⋮ → Extend from
   ~0:45 → add `[Outro - Fade]` → finish to 60s

## Recovery Tactics If First Batch Fails

| Symptom | Fix |
|---|---|
| **Too melodic** (piano solos, not ambient) | Add to Style end: `"sparse melodic content, minimal note density, long sustained tones, texture over melody"`. Replace piano-centric terms with `"atmospheric pads"`. |
| **Drums sneak in** | Stack negation harder: `"no drums, no kick, no snare, no hi-hat, no percussion, no rhythm section, no beat, beatless, no pulse"` at very end. Add `[Beatless]` in Lyrics. Regen 4-6 times — variance is high. |
| **Cuts off short** | Use Extend feature from 0:45 with `[Outro - Fade]`. Don't fight it in a single gen. |
| **Too synthwave / sci-fi** | Add `"warm acoustic textures, organic recordings, no synthwave, no retrowave, no sci-fi, no neon"`. |
| **Too dark / mournful** | Add `"hopeful resolution, warm major harmonies, calm not melancholic"`. |
| **No clear midpoint impact** | Don't try to force it. Accept whatever shape Suno gives, then in post add a 1-shot sub-bass + glass shatter SFX at 0:18.5 aligned to the visual crack. |

## When to Stop Iterating

If you've burned 12+ generations and still nothing clears the bar:

1. Lock the best gen as the bed (even if imperfect)
2. Add separate **sound design layer** in post:
   - Sub-bass impact at 0:18.5
   - Crystalline shatter SFX at 0:18.5
   - Crescendo whoosh into Beat 8 (0:47-0:48)
3. The final score = Suno bed + custom SFX layered

That gives you both atmosphere AND moment control.

## Save Location

When you pick the winner: download as MP3 and save to:

```
demo-video/assets/audio/score-suno.mp3
```

The 60s composition will import it as a single `<audio>` track.

## Sources

- https://hookgenius.app/learn/suno-instrumental-prompts/
- https://hookgenius.app/learn/suno-negative-prompting/
- https://hookgenius.app/learn/suno-character-limits/
- https://blakecrosley.com/guides/suno
- https://suno.bi/blog/suno-v5-5-prompt-engineering-advanced-techniques-2026-en
- https://jackrighteous.com/en-us/pages/suno-ai-meta-tags-guide
- https://musicsmith.ai/blog/ai-music-generation-prompts-best-practices
