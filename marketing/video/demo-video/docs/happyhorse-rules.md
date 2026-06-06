# HappyHorse Generation Rules

Lessons-baked rules for fal HappyHorse-1.0 (`alibaba/happy-horse/text-to-video`)
clip generation for the Quest-On 60s ad. **Every clip MUST follow this template.**

## Lessons Learned (v1 → v2)

| # | Mistake in v1 | Fix in v2 (and beyond) |
|---|---|---|
| 1 | A graduation-cap silhouette wandered into the blackbox shot | Explicit `no people, no graduation caps, no academic robes` |
| 2 | Cube surface had fake AI-generated UI cards floating around | Explicit `no fake UI labels, no panels with text, no readable interface text` |
| 3 | Lighting drifted toward sci-fi blue every clip | Pin palette to literal hex: `#05070F`, `#3559C4`, `#57CDFF` |
| 4 | Cube identity inconsistent between clips (size, finish) | `same heavy graphite cube as before, identical lighting` continuity language |
| 5 | Camera over-rotated, broke premium institutional tone | Explicit `slow controlled cinematic camera`, restrict motion to "dolly-in 6%", "orbit 30°" etc. |
| 6 | Audio tracks in clips conflicted when stitched | Always mute fal audio in final composition; use single Suno score |

## Style Block (PREFIX every prompt with this)

```
A premium institutional B2B SaaS commercial scene for a university
assessment platform called Quest-On. Quest-On brand palette: deep navy
background (#05070F), graphite matte cube surfaces, cobalt blue
(#3559C4) primary accent, very limited cyan (#57CDFF) highlights only
on critical light points. Mood: calm, serious, trustworthy, premium
institutional. Slow controlled cinematic camera, restrained motion,
precise hard shadows, subtle volumetric haze. Composition centered,
16:9, photorealistic 3D render quality. Audio: subtle low institutional
tone, quiet glass resonance, no speech.
```

## Negation Block (APPEND to every prompt)

```
Strict exclusions: no people, no human silhouettes, no faces, no hands,
no graduation caps, no academic robes. No readable text, no letters, no
numbers, no fake UI labels, no fake interface text, no panels with
text, no charts with labels. No logos, no university marks, no brand
names, no watermarks. No sci-fi tropes, no cyberpunk, no fantasy
elements, no spaceship, no magic effects, no explosive sparks, no lens
flare overload, no neon, no holograms with readable content. Single
subject only. Same graphite cube identity across all clips for
continuity.
```

## Per-Clip Subjects (ONLY this part varies)

### Clip 00b — `00-cheating-student` (Beat 1, ~6s used = the full generated clip)

> ⚠️ This clip INTENTIONALLY breaks the global "no people" negation —
> it needs a (faceless) student figure. It uses the `STYLE_BLOCK_PEOPLE`
> / `NEGATION_BLOCK_PEOPLE` variant in the script (`breaksNoPeople: true`)
> which permits a person seen only from behind/above but bans visible
> faces, other people, dramatic/security-camera lighting. Tone stays
> calm and institutional, never criminal-drama.
>
> **Current cut (v20+): no padding.** Every fal clip in the film plays
> ONLY its genuinely-generated ~6s — no freeze-frame holds, no
> ffmpeg-zoom extends. The padded synthetic tails read as stale, so the
> composition was retimed to ~59.5s (down from 64s) so each AI beat is
> exactly as long as the model delivered. Use the `.silent.mp4` files
> (audio stripped, 24fps-normalized) directly. The "End-Freeze Handling"
> recipe below is kept only for reference — it is NOT used anymore.

```
A single continuous 6-second shot in three clear movements.
MOVEMENT ONE (0–2s): a university student sits alone at a desk during
an exam, seen from directly behind and slightly above so the face is
never visible — only back of head, shoulders, hands on a laptop
keyboard. On the desk beside the laptop: a printed exam paper. The
laptop screen shows an AI chat interface as soft abstract message
bubbles only — no legible text, just rounded cobalt-blue (#3559C4)
bubble shapes on a dark panel. The student is quietly typing a
question into the AI assistant. One soft overhead light, deep navy
ambient (#05070F), cobalt-blue glow from the screen onto desk and
hands. Mood: calm, quiet, ordinary — the new normal, NOT a crime
scene, NOT dramatic, NOT thriller lighting, NOT security-camera.
Camera nearly still.
MOVEMENT TWO (2–4.5s — the centerpiece, give it room): the desk,
exam paper, laptop, and student all come apart into a slow, controlled,
intentional drift of cobalt-blue (#3559C4) particles flowing inward
toward the exact center of frame — deliberate and graceful, like fine
sand drawn upward, never chaotic, never an explosion, never sparks. By
4.5s the figure and desk are fully gone and only a dense glowing
cube-shaped cloud of cobalt particles remains at center, edges
hardening.
MOVEMENT THREE (4.5–6s): the cloud densifies and crystallizes into a
single fully-formed, solid, opaque graphite matte cube at the exact
center of frame — fine graphite micro-texture, one thin cobalt-blue
(#3559C4) rim light along one edge, no markings. Weighty, geometric,
the opaque "black box". In the final 1s the camera does a
barely-perceptible slow push-in toward the cube — gentle ongoing
motion, not a frozen frame. The cube MUST be clearly visible, solid,
recognizable as a cube by the last frame. Deep navy void (#05070F),
cobalt blue (#3559C4) accent, very limited cyan (#57CDFF) on critical
light points only. No visible faces, no other people, no readable
text, no logos, no university marks, no watermarks. 16:9,
photorealistic.
```

**End-Freeze Handling (6s clip → 9s Beat 1).** After picking a good
clip: strip audio → `00-cheating-student.silent.mp4`. Then build
`00-cheating-student.padded.mp4` (~9.04s = 217 frames @ 24fps) by
appending a 72-frame (3.0s) slow push-in on the clip's **genuine last
frame** (frame 144 — NOT `-sseof -0.1`, which grabs a different frame
and makes the join pop):

```bash
# 1. genuine last frame of the 145-frame raw clip
ffmpeg -y -i assets/video/00-cheating-student.silent.mp4 \
  -vf "select=eq(n\,144)" -vframes 1 /tmp/cube-last.png

# 2. jitter-free slow push-in. zoompan jitters at output resolution, so
#    upscale the still to 7680px first → the per-frame integer crop
#    rounding becomes 0.25px at 1920 (sub-perceptible). Zoom 1.00→1.13
#    over the 72 frames reads as a deliberate slow dolly-in (the old
#    0.0007*on curve only reached ~1.05 and read as a frozen frame).
ffmpeg -y -loop 1 -i /tmp/cube-last.png -vf \
  "scale=7680:-2:flags=lanczos,zoompan=z='1+0.13*on/71':d=72:fps=24:s=1920x1080:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',format=yuv420p" \
  -frames:v 72 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -an /tmp/cube-push.mp4

# 3. concat (seamless: cube-push frame 0 == raw frame 144 at zoom 1.0)
printf "file '%s'\nfile '%s'\n" \
  "$(pwd)/assets/video/00-cheating-student.silent.mp4" "/tmp/cube-push.mp4" \
  > /tmp/concat.txt
ffmpeg -y -f concat -safe 0 -i /tmp/concat.txt -r 24 -c:v libx264 \
  -preset slow -crf 16 -pix_fmt yuv420p -an -movflags +faststart \
  assets/video/00-cheating-student.padded.mp4
```

Verify the result has exactly 217 frames and 9.0417s. Do NOT use the
older `crop=w='iw/zoom'...` form for the zoom — `crop` evaluates its
dimensions once at init, not per-frame, so it produces a static crop,
not a zoom. Tried generating the cube tail fresh on fal
(`scripts/regen-cube-hold.mjs`); HappyHorse takes "locked-off tripod"
literally and renders the cube sitting on a photographic tripod —
unusable. The deterministic still-zoom above is the reliable path.

### Clip 0 — `00-hook-particle-void` (5s used, gen 6s)

```
Cobalt blue particles (#3559C4 with very limited #57CDFF highlights)
slowly drift in a deep navy void. The particles are sparse, not
sparkly — small soft points at varied depths. As the clip progresses,
particles begin to converge subtly toward the center frame. In the
last 1.5 seconds a faint dark silhouette of a graphite cube begins to
condense at the center. The cube is barely visible, almost a shadow.
Static camera with imperceptible 0.3% zoom-in. No subject other than
particles and the emerging cube shadow.
```

### Clip 1 — `01-blackbox-approach` (7s used, gen 6s + freeze pad if needed)

```
A heavy graphite matte cube, the same cube identity that emerged at
the end of the previous clip, sits exactly at the center of the frame
in the deep navy void. The cube surface is opaque, with very fine
graphite micro-texture and a single thin cobalt blue rim light along
one edge. The camera dollies in slowly by approximately 6% over the
clip. No other elements in frame. The cube must feel weighty, calm,
inspectable but unrevealing. No surface markings, no inscriptions.
```

### Clip 2 — `02-crack-signature` ★ (7s used, gen 6s)

```
The same graphite cube as the previous clip, in the same center
position, same lighting. At second 1, a single bright cobalt blue
(#3559C4) point of light ignites on the front-facing surface. From
that point, a sharp crystalline crack propagates across the cube
surface over the next 3 seconds — clean, deliberate, not violent. By
second 5, the cube surface fractures inward and a transparent glass
cube interior becomes visible inside, with faint internal cobalt
traces. The camera holds static with a micro-shake at the moment of
ignition only. The motion must feel inevitable, not explosive.
```

### Clip 3 — `03-glassbox-orbit` (8s used, gen 6s)

```
The graphite outer shell from the previous clip is gone. A clean
transparent glass cube sits at the same center position, same scale,
same environment. Inside the glass cube, faint cobalt blue wireframe
traces and small particles arrange themselves in an abstract circuit-
like pattern (NOT readable text, NOT letters, NOT numbers — only
abstract lines and dots). The camera orbits the cube slowly by
approximately 30 degrees from front-left to front-right over the
clip. Calm, trustworthy, restrained.
```

### Clip 4 — `04-glassbox-close` (7s used, gen 6s)

```
The same transparent glass cube as the previous clip, settled facing
the camera. The camera pushes in slowly by 12% over the clip. As the
camera approaches, the internal cobalt traces resolve into four
distinct abstract panels arranged in a 2x2 grid inside the cube — top-
left, top-right, bottom-left, bottom-right — each panel showing a
different abstract pattern (still NOT readable text, NOT UI). In the
last 1 second, the panels emit a subtle warm cobalt pulse and the
image holds steady.
```

## Generation Procedure

1. Confirm `FAL_KEY` is exported.
2. Run `node scripts/generate-happyhorse-batch.mjs --all` (see script).
3. Each clip: 1080p, 16:9, 6s duration, ~$0.5/clip via `queue.fal.run`.
4. Outputs: `assets/video/<prefix>.mp4` + `<prefix>.submit.json` + `<prefix>.result.json`.
5. After all 5 land, run `--extract-frames` to dump first/last PNGs for match-cut review.

## Match-Cut Acceptance

| Boundary | Acceptance |
|---|---|
| 0.last → 1.first | Cube shadow center within ±20px of cube center |
| 1.last → 2.first | Same cube position; identical surface texture/lighting |
| 2.last → 3.first | Glass cube inside crack matches glass cube of clip 3 |
| 3.last → 4.first | Glass cube center, same scale, no orbit-jump |

If a boundary fails: regenerate the offending clip OR mask with a 0.3s
crossfade at composition time. Never accept a >20px center jump.

## Cost & Time Budget

- 5 clips × $0.5 = ~$2.5 baseline
- Expect 40-60% retry rate on first pass → budget $5-10 total
- Wall time: 60-180s per clip in queue → 30-60min for full batch
- If a clip needs >2 retries, escalate prompt with stronger negation or
  reduce motion ambition (e.g., shorter dolly distance)

## Continuity Watch List

After all 5 clips arrive, check:

- [ ] Cube scale across clips 1, 2, 3, 4 (use first/last frame stills)
- [ ] Cobalt rim light position consistent (clip 1 to 2)
- [ ] Crack origin point matches future glass cube interior alignment
- [ ] Background void uniform — no clip drifts toward black or toward bluer navy
- [ ] No clip introduces accidental people, text, or UI

If continuity fails on a non-critical clip, accept and dim/blur the
weakest 0.5s. If it fails on Clip 2 (signature crack), regenerate.
