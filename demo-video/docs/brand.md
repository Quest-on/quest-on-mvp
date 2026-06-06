# Quest-On Brand Tokens

Source of truth for the 60s launch ad. Pulled from the live product (`app/globals.css`,
`qstn_logo_svg.svg`) and v8 Remotion brand block.

## Palette

| Token         | Hex / Value                                         | Use                                  |
| ------------- | --------------------------------------------------- | ------------------------------------ |
| `bg`          | `#05070F`                                           | Composition background, void scenes  |
| `bg-soft`     | `#0A0F1F`                                           | Subtle layered bg, card containers   |
| `primary`     | `#3559C4`                                           | Primary cobalt, CTA, particle base   |
| `primaryLight`| `#57CDFF`                                           | Highlights, accent words, glow tips  |
| `primaryDeep` | `#2F46B9`                                           | Logo gradient deep stop              |
| `primarySoft` | `rgba(53, 89, 196, 0.55)`                           | Ambient glow                         |
| `ink`         | `#0F172A`                                           | Light-mode text                      |
| `inkInverse`  | `#F8FAFC`                                           | Dark-mode hero text                  |
| `inkMuted`    | `rgba(248, 250, 252, 0.62)`                         | Subhead, body                        |
| `inkFaint`    | `rgba(248, 250, 252, 0.32)` (raise to 0.50+ for WCAG) | Strikethrough states, captions     |
| `red`         | `#DC2626`                                           | "X" / 금지 표시 (use restrained)    |
| `green`       | `#16A34A`                                           | Verified / pilot proof badges        |

## Logo Gradient

```css
background: linear-gradient(135deg, #57cdff 0%, #3559c4 50%, #2f46b9 100%);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
```

## Typography

- Hero / display: `Pretendard Variable` 700-800, letter-spacing -0.04em on display sizes
- Body / sub: `Pretendard` 400-500, letter-spacing -0.012em
- Mono / kicker / labels: `JetBrains Mono` 500, uppercase, letter-spacing 0.32-0.40em

Pretendard `.woff2` lives in `fonts/`. Linked via `@font-face` for deterministic
embedding (otherwise compiler falls back to Inter and Korean breaks).

## Slogan

- Korean primary: **AI 시대 대학 시험의 새 기준**
- Why claim: **AI 사용을 막는 대신, 활용 과정을 평가합니다**
- English short: **A new standard for exams in the AI era**

## Tone (Voice)

- Premium institutional. Calm authority. Not sales-energy. Not technical-flex.
- Korean copy reads with deliberate pauses. Comma weight matters.
- Avoid: "혁신", "AI 탐지", "부정행위 잡는", "패러다임" — overused.
- Use: "기록", "검증", "활용 과정", "사고 과정", "신뢰".

## Visual Metaphor (binding for ALL hero shots)

- **Blackbox**: heavy graphite matte cube. Opaque surface. Inside is process — but unseen.
- **Glassbox**: clear glass cube with internal cobalt traces. Same shape, transformed.
- **Crack**: single cobalt point of light → sharp crystalline crack → blackbox shell breaks → glass interior.
- **Particles**: cobalt drift, never thick, never sparkly. Density = state, not decoration.

## Forbidden Visual Tropes

These break the institutional brand if they slip in:

- People (especially graduation caps, robes — see `docs/happyhorse-rules.md` lessons)
- Readable fake UI text in 3D scenes
- University crests, real or fake
- Cyberpunk neon, sci-fi spaceships, hologram panels with glyphs
- AI-generated "Korean text" in cinematic shots — always do Korean in hyperframes layer
