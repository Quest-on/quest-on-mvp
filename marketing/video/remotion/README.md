# Quest-On Remotion Demo

Quest-On 60초 프로덕트 데모 비디오. Remotion 4.x + Pretendard + 모션그래픽.

## Storyboard (60s 안에 56.9s 재생, 1708f @ 30fps)

> Sequence 길이 합은 1800f이지만, TransitionSeries가 각 cut을 overlap하므로 실제 비디오는 1708f.

| # | 씬 | 길이 | 절대 프레임 (start–end) | 핵심 |
|---|---|---|---|---|
| 1 | **Hook** | 240f / 8s | 0–239 | "AI 시대, 시험은 어떻게 달라져야 할까" 시네마틱 오프닝 |
| 2 | **Problem** | 210f / 7s | 226–435 | 두 개의 벽: AI 차단 vs 결과만 채점 |
| 3 | **Instructor** | 330f / 11s | 422–751 | Wide → Working → CloseUp 3단 컷 |
| 4 | **Student** | 330f / 11s | 738–1067 | 학생-AI 채팅 typewriter + CloseUp |
| 5 | **Evidence** | 240f / 8s | 1054–1293 | 답안·대화·신호 3패널 stagger |
| 6 | **Wow** ★ | 270f / 9s | 1272–1541 | AI 채점 88점 reveal — circle MaskReveal + spring overshoot |
| 7 | **CTA** | 180f / 6s | 1528–1707 | Quest-On 로고 + URL |

Transition 패턴: 모두 fade(14f), 단 Evidence→Wow만 wipe-from-bottom(22f) 으로 빌드업.

### Wow Impact Frame
WowScene 내부 frame 55 = **절대 frame 1327** — sub-bass impact 동기 포인트.

## Stack

- **Remotion** 4.0.452
- **@remotion/transitions** 4.0.452 — TransitionSeries (fade, wipe)
- **@remotion/fonts** 4.0.452 — Pretendard Variable woff2 임베드
- **@remotion/captions** 4.0.452 — SRT 자막 파이프라인 (자막 추가 시)
- **@remotion/animation-utils**, **@remotion/layout-utils**, **@remotion/paths**, **@remotion/shapes**, **@remotion/google-fonts** 모두 설치됨

## Folder Structure

```
remotion/
  Root.tsx                       # Composition 등록 (1920×1080, 30fps, 1708f)
  index.ts                       # registerRoot
  public/
    fonts/PretendardVariable.woff2
    audio/silence.mp3            # 60s 무음 placeholder
  quest-on-demo/
    QuestOnDemo.tsx              # TransitionSeries 루트
    constants.ts                 # SCENE_DURATIONS, COLORS, EASING, SPRINGS, TYPO 토큰
    fonts.ts                     # Pretendard side-effect loader
    script.ts                    # 카피·씬 데이터 + theme 별칭
    components/                  # 11 reusable 컴포넌트
      AnimatedGrid, GradientMesh, SceneShell, BrowserFrame,
      Kicker, TitleBlock, StaggeredWords, Callout,
      MaskReveal, Parallax, CloseUp, ScoreReveal
    scenes/                      # 7 scene components
      HookScene, ProblemScene, InstructorScene, StudentScene,
      EvidenceScene, WowScene, CTAScene
```

## Commands

```bash
npm run studio       # Remotion Studio (브라우저 프리뷰, hot reload)
npm run render       # 풀 비디오 → ../out/quest-on-demo.mp4 (H.264 1080p)
npm run still        # 대표 프레임 → ../out/quest-on-demo.png
npm run typecheck    # 타입 체크 (strict)
```

## Design Tokens (constants.ts)

- **Spring presets**: `smooth` (damping 22 / stiffness 100) — 카드 디폴트. `gentle` (26/80) — 큰 패널. `snappy` (18/160) — 버튼. `bouncy` (11/160) — Wow 모먼트만.
- **Easing**: `smoothOut` cubic-bezier(0.22, 1, 0.36, 1) 디폴트, `expoOut` snappy, `cubicInOut` mask reveal, `cubicOut` smooth presentation.
- **Typo**: Pretendard Variable, letter-spacing 본문 -0.01em / 헤드라인 -0.025em, line-height 1.05/1.65.

## 다음 스텝 — 오디오 추가하기

현재 비디오는 **무음**. 오디오는 라이센스 이슈로 자동 처리하지 않았다. 트랙 준비되면:

1. `public/audio/` 에 다음 파일 배치:
   - `bgm.mp3` — BGM (Mixkit/Uppbeat에서, 90-100 BPM 미니멀 신스 권장, 약 60s)
   - `vo.mp3` — Korean VO (60s 안 240-280자 분량)
   - `whoosh.mp3` — 챕터 전환 SFX (200-300ms)
   - `tick.mp3` — UI tick (60-80ms)
   - `impact-subbass.mp3` — Wow 모먼트 sub-bass (120ms, 40-80Hz)

2. `quest-on-demo/QuestOnDemo.tsx` 의 audio slot 주석을 활성화:
   ```tsx
   import { Audio, Sequence, staticFile } from "remotion";

   <Audio src={staticFile("audio/bgm.mp3")} volume={0.35} />
   <Audio src={staticFile("audio/vo.mp3")} />
   <Sequence from={1327}>
     <Audio src={staticFile("audio/impact-subbass.mp3")} />
   </Sequence>
   ```

3. 자동 자막 (선택):
   ```bash
   npm i @remotion/install-whisper-cpp
   # whisper.cpp 로 vo.mp3 → vo.srt 생성
   ```
   `@remotion/captions` 의 `parseSrt` 로 SRT 파싱 후 화면 하단에 렌더.

4. 재렌더: `npm run render`

## References

- 리서치 리포트: `../.omc/research/remotion-demo-best-practices.md`
- Remotion 공식 best-practices skill: `.agents/skills/remotion-best-practices/`
- Remotion docs: https://remotion.dev/docs
