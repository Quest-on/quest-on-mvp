# Quest-On AI Video Ad Generation Research

Date: 2026-05-08

## Executive Recommendation

Quest-On 영상은 HappyHorse/Seedance/Veo/Runway/Kling 같은 AI 영상 생성 플랫폼에 **전체 60초 광고를 한 번에 맡기면 안 된다.**

이유:
- 제품 UI와 한국어 텍스트가 핵심인데, text-to-video 모델은 UI 텍스트, 숫자, 버튼, 리포트 화면을 쉽게 왜곡한다.
- Quest-On은 감성 B-roll 광고가 아니라 `대학 평가 신뢰`, `AI 활용 과정 기록`, `교수/학생 워크플로우`, `동국대/홍익대 검증`을 보여줘야 한다.
- 광고처럼 보이려면 AI 시네마틱도 필요하지만, 데모처럼 믿기려면 실제 제품 화면이 반드시 들어가야 한다.

따라서 추천 워크플로우:

**HappyHorse/Seedance/Kling/Runway/Veo로 blackbox/glassbox 시네마틱 컷 생성**
**+ Quest-On 실제 UI는 Remotion/스크린샷 기반으로 고정 합성**
**+ Descript/CapCut/Premiere에서 보이스오버, 자막, 음악, 컷다운 편집**

## Current Model Landscape — 2026-05-08

Seedance 2.0은 여전히 강력하지만, 더 이상 "최상위 단독 후보"로 보면 안 된다.
2026년 5월 8일 현재 확인한 공개 리더보드와 공식 출시 자료를 기준으로는 다음처럼 봐야 한다.

Artificial Analysis의 Text-to-Video no-audio leaderboard 최신 표에서는 `HappyHorse-1.0`이 1위, `Dreamina Seedance 2.0 720p`가 2위, `Kling 3.0 1080p (Pro)`가 3위, `Kling 3.0 Omni 1080p (Pro)`가 4위권으로 잡힌다. 즉 "Seedance 2.0 이상"을 찾는다면 1차로 HappyHorse, Kling 3.0, Kling 3.0 Omni를 같이 봐야 한다. 다만 이 표는 no-audio blind preference 중심이므로, 실제 광고 제작에서는 권리, 접근성, 편집 워크플로우, UI 합성 안정성까지 따로 평가해야 한다.

### Top Tier Candidates

| Rank for Quest-On Testing | Model | Why It Matters | Caveat |
| --- | --- | --- | --- |
| 1 | **HappyHorse-1.0** | Artificial Analysis Text-to-Video no-audio leaderboard에서 1위. 시네마틱 metaphor 컷 품질 실험 대상으로 최우선. | 신생 모델. API/상업 이용/프로덕션 안정성은 계정과 제공 표면별로 재확인 필요. |
| 2 | **Kling AI 3.0 / Video 3.0 Omni** | Kuaishou 공식 발표 기준 multi-shot storyboard, native audio, 최대 15초, multimodal workflow. 광고 컷처럼 여러 카메라 컷이 필요한 경우 강함. | 공식 접근/요금/권리 조건은 계정별 확인 필요. 제품 UI 텍스트 생성은 여전히 위험. |
| 3 | **Seedance 2.0** | ByteDance 공식 기준 text/image/audio/video reference와 audio-video joint generation. blackbox/glassbox, crack, camera motion에 여전히 적합. CapCut/Dreamina 연동으로 편집 접근성이 좋다. | HappyHorse 등장 이후 no-audio visual quality 기준 1위는 아님. IP 논란과 글로벌 접근성 리스크. |
| 4 | **Runway Gen-4.5** | Runway 공식 문서 기준 motion quality, prompt adherence, visual fidelity가 강점. 상업 사용 FAQ가 명확하고 제작 워크스페이스가 성숙함. | 리더보드 순위만 보면 최상단은 아님. 2-10초 단위 생성, 비용 증가 가능. |
| 5 | **Google Veo 3.1** | Google/Gemini 표면 기준 8초 native audio video 생성, realism, prompt adherence, image-to-video에 강함. | watermark/SynthID, access/plan 조건. Quest-On 제품 UI 직접 생성에는 부적합. |
| 6 | **Sora 2 / Sora 2 Pro** | OpenAI API 표면 기준 synced audio video 생성 가능. 가격과 API surface가 명확한 편. | current no-audio leaderboard에서는 상위권이 아님. B2B 데모 최종 조립용보다 후보 컷 실험용. |

### Practical Read

- **"현재 최고 품질 실험"**: HappyHorse-1.0
- **"광고용 multi-shot narrative"**: Kling 3.0 / Video 3.0 Omni
- **"Seedance 계열 최상위/편집 접근성"**: Seedance 2.0 via CapCut/Dreamina
- **"프로덕션 워크플로우/권리 안정성"**: Runway Gen-4.5
- **"audio-video sync / cinematic realism"**: Seedance 2.0, Veo 3.1, Sora 2
- **"Quest-On 최종본"**: AI 모델 단독이 아니라 Remotion 합성 필수

Watch list:
- `Bach-1.0 Preview`, `Wan 2.7`, `SkyReels V4`, `PixVerse V6`, `Vidu Q3 Pro`도 리더보드 상단/중상단에 보이지만, Quest-On 광고에는 아직 1차 후보가 아니다. 이유는 간단하다. 우리는 "좋은 영상"보다 "실제 제품 데모처럼 믿기는 광고"가 필요하고, 그 기준에서는 접근성, 권리, 반복 생성, UI 합성 흐름이 더 중요하다.

## Quest-On Fit Scorecard

| Criterion | Weight | Best Candidate | Reason |
| --- | ---: | --- | --- |
| Visual premium feel | 25% | HappyHorse-1.0, Seedance 2.0 | blackbox/glassbox 같은 추상 시네마틱 컷의 첫인상을 좌우한다. |
| Shot control / narrative | 20% | Kling 3.0 Omni, Seedance 2.0 | 15초 안에서 shot size, camera movement, multi-shot flow를 줄 수 있어 광고 컷 테스트에 맞다. |
| Product demo credibility | 20% | Remotion | 실제 UI, 한국어, 수치, proof card는 생성 모델이 아니라 코드 기반 합성이 담당해야 한다. |
| Commercial workflow clarity | 15% | Runway, OpenAI API, Google | 제작/권리/가격/계정 조건이 비교적 명확해야 외부 공개물이 된다. |
| Native audio | 10% | Seedance 2.0, Kling 3.0, Veo 3.1, Sora 2 | 단, 최종 Korean VO는 별도 녹음/합성이 더 안전하다. |
| Risk control | 10% | Remotion + abstract AI clips | 실제 대학명/브랜드/학생 얼굴/제품 UI를 생성 모델에 맡기지 않아야 한다. |

Objective verdict:

**A-grade 이상을 노리면 "하나의 최고 모델"을 고르는 문제가 아니다.**
Quest-On은 B2B SaaS 데모 광고라서, AI 모델의 리더보드 1위보다 `제품 신뢰`, `UI 정확도`, `한국어 카피`, `실제 파일럿 증거`가 더 중요하다. 그래서 생성 모델은 3-4개의 hero metaphor 컷만 경쟁시키고, 승자 컷을 Remotion 안에 넣는 방식이 가장 안전하다.

## Best-Fit Workflow for Quest-On

### Recommended Stack

1. **Remotion**
   - 실제 UI 화면, 제품 데모, 한국어 텍스트, proof card, 브랜드 lockup 담당.
   - 현재 코드베이스와 가장 잘 맞는다.

2. **HappyHorse-1.0**
   - 현재 공개 Artificial Analysis no-audio T2V/I2V 계열에서 Seedance 2.0보다 위로 보고되는 최신 강자.
   - blackbox/glassbox 같은 silent cinematic metaphor 컷을 먼저 테스트할 가치가 가장 높다.
   - 단, API/상업 사용/계정 접근 안정성이 아직 초기라 최종 production dependency로 잠그기 전 검증이 필요하다.

3. **Runway**
   - AI 영상 생성 + 편집/iteration 도구.
   - Runway 자체 Gen-4/Gen-4.5의 장점은 camera choreography, prompt adherence, image-to-video control, export/iteration workflow다.
   - 상업 사용 관련 문서가 비교적 명확하다.

4. **Kling 3.0 / Video 3.0 Omni**
   - Kuaishou 공식 발표 기준 multi-shot storyboard, native audio, photorealistic output, stronger consistency가 강점.
   - Quest-On 15초 광고 컷다운처럼 "한 번에 여러 컷을 가진 짧은 광고 시퀀스"를 만들 때 후보.

5. **Seedance 2.0**
   - blackbox/glassbox, crack, cinematic camera movement, audio-synced abstract scenes에 적합.
   - ByteDance 공식 문서 기준 text/image/audio/video multimodal input과 audio-video joint generation을 강조한다.
   - 다만 IP/저작권 논란과 지역/제품 접근성 리스크가 있어, 브랜드 핵심 산출물은 Runway 같은 안정적인 제작 허브 안에서 테스트하는 편이 낫다.

6. **Veo 3.1**
   - realism, prompt adherence, native audio가 강점.
   - Google Flow/Gemini/Cloud 쪽 접근성이 맞으면 고품질 시네마틱 B-roll 후보.
   - SynthID/watermark/provenance 정책을 고려해야 한다.

7. **Descript**
   - 화면 녹화/제품 데모/보이스오버/자막/멀티 포맷 컷다운 편집에 적합.
   - AI 영상 자체보다 "스크린 기반 제품 데모 광고" 편집기로 유용하다.

## Platform Assessment

| Platform / Model | Fit for Quest-On | Strength | Risk |
| --- | --- | --- | --- |
| HappyHorse-1.0 | Very high for visual experiments | 최신 공개 리더보드 상위, no-audio visual quality, motion realism | 신생 모델, production/legal/access 검증 필요 |
| Runway | Very high | 모델 허브, Gen-4 이미지 기반 제어, 편집/업스케일/iteration, 상업 사용 문서 명확 | 비용, 모델별 결과 편차 |
| Kling 3.0 / Video 3.0 Omni | High | multi-shot storyboard, native audio, photorealism, 15초 narrative | UI 텍스트 생성 부적합, 계정/권리 확인 필요 |
| Seedance 2.0 | High for cinematic scenes | blackbox/glassbox, 복잡한 카메라, native audio, multimodal references | UI 텍스트 왜곡, IP 논란, 접근성/정책 변동 |
| Google Veo 3.1 | High for realism | 현실감, prompt adherence, native audio, Flow/Gemini/Cloud ecosystem | watermark/SynthID, 접근/쿼터/계정 조건 |
| Sora 2 / Sora 2 Pro | Medium | API 기반 synced-audio video generation, 가격/엔드포인트 명확 | 리더보드 기준 최상위권은 아님. 접근 권한과 brand safety 확인 필요 |
| Descript | High as editor | 제품 데모, 스크린 녹화, voiceover, captions, ad variants | cinematic generation 자체는 주력 아님 |
| Synthesia/HeyGen class | Low-medium | presenter/talking-head, enterprise comms | Quest-On 광고 톤에는 avatar가 싸게 보일 수 있음 |
| UGC ad tools | Low | 커머스/틱톡 광고 대량 생산 | 대학 B2B 평가 플랫폼과 톤 불일치 |

## Recommended Production Plan

### Phase 1 — Generate 6-8 Second Cinematic Assets

AI 모델에 맡길 컷:

1. `AI entered the exam`
   - abstract AI prompts, document fragments, blue cursor, university exam mood.
   - No real university logos.

2. `Blackbox`
   - graphite cube, hidden prompts inside, professor sees only final answer.

3. `Crack`
   - black cube cracking, cobalt light, prompt/source/revision labels becoming visible.

4. `Glassbox`
   - transparent cube, layered evidence traces, process becomes inspectable.

5. `Trust network`
   - thought path lines branching into university case domains.

AI 모델에 맡기면 안 되는 컷:

- 실제 Quest-On UI
- 동국대/홍익대/숙명여대 proof card의 텍스트
- 한국어 핵심 카피
- 교수 최종 확정 버튼/루브릭/리포트 화면

이것들은 Remotion에서 렌더해야 한다.

### Phase 2 — Build Product Proof in Remotion

Remotion에서 고정 제작:

- 교수 계정: AI와 문제 생성
- 학생 계정: AI 활용 시험 응시
- 과정 기록: 질문 -> 근거 -> 수정 -> 최종 판단
- 교수 계정: AI 가채점 + 과정 리포트 + 최종 점수 확정
- 증거 카드: 동국대 110명, 홍익대 80% 감소/0건, 숙명여대 강연
- Quest-On brand lock

### Phase 3 — Edit and Cutdowns

최종 산출물:

- 60s main demo ad
- 30s pitch cutdown
- 15s social cut
- 6s bumper

편집:
- Descript or CapCut for VO/captions/social variants.
- Premiere/DaVinci if human editor is involved.

## Suggested First Experiment

**Do not start with full ad generation.**

First test six AI/model lanes, but only on the same three shots:

1. Blackbox cube, 6s
2. Crack to glassbox, 6s
3. Glassbox process traces, 6s

Run the same prompts on:
- HappyHorse-1.0
- Kling 3.0 / Video 3.0 Omni
- Seedance 2.0
- Runway Gen-4.5
- Veo 3.1
- Sora 2 / Sora 2 Pro, only if API/project access is already available

Then place the best three outputs between existing Remotion UI scenes.

Success criteria:
- Looks premium, not generic AI slop.
- Does not look like sci-fi unrelated to university testing.
- Supports the product demo rather than replacing it.
- No unreadable fake Korean UI text generated by model.

### Test Matrix

| Test | Required Output | Pass/Fail Standard |
| --- | --- | --- |
| A. Visual Quality | 3 candidate clips per model | Can sit next to a polished SaaS demo without looking like stock AI footage. |
| B. Prompt Adherence | Same prompt across models | Cube must clearly read as opaque -> cracked -> transparent process trace. |
| C. Motion Control | Slow dolly/orbit, no chaotic camera | Camera movement supports the message; no random morphing or irrelevant objects. |
| D. Text/UI Safety | No readable generated text except abstract marks | Any fake Korean/UI text is automatic fail for product-facing shots. |
| E. Brand Fit | Premium institutional, not sci-fi trailer | 대학 평가/신뢰/검증 톤으로 보이는지. |
| F. Rights/Access | Exportable file with acceptable use terms | 공개 광고에 쓸 수 있는 계정/요금/권리 조건인지 확인. |

## Prompt Direction

### HappyHorse / Seedance / Runway / Veo / Kling Prompt — Blackbox

```
A premium institutional technology commercial scene. A heavy matte graphite cube floats in a dark navy void. Inside the cube, faint layers of student AI prompts, source cards, answer revisions, and rubric traces glow in cobalt blue, but the outer surface remains opaque. A professor silhouette outside the cube can only see a single final answer card. Slow dolly-in camera, controlled cinematic lighting, minimal, serious, no sci-fi spaceship, no people faces, no logos, no readable brand names.
```

### Crack to Glassbox

```
A heavy black graphite cube begins to crack from one sharp cobalt point. Through the crack, transparent glass layers appear: prompt, evidence, revision, rubric, final judgment. The cube transforms from opaque blackbox to clear glassbox. Premium B2B software commercial style, dark navy background, precise glass refraction, restrained glow, slow cinematic camera move, no text except abstract UI-like lines, no logos.
```

### Glassbox Process Trace

```
A transparent glass cube contains layered process traces for an AI-assisted university exam: question, evidence, revision, final reasoning, rubric. Thin cobalt lines connect each layer. The camera orbits slowly around the cube, then settles front-on. Premium institutional SaaS commercial, clean, trustworthy, calm, deep navy and cobalt palette, no fake readable text, no human faces, no logos.
```

## Legal / Brand Safety Notes

- Do not prompt with real university logos unless explicit permission/assets are secured.
- Do not prompt celebrities, movie styles, protected characters, or named directors.
- Use own UI screenshots and Quest-On brand assets for all product-specific frames.
- Keep AI-generated clips abstract enough to avoid IP/likeness issues.
- If publishing externally, disclose AI-assisted production where appropriate.

## Sources

- Artificial Analysis Text-to-Video Leaderboard: https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video
- Artificial Analysis Text-to-Video Leaderboard current page: https://artificialanalysis.ai/video/leaderboard/text-to-video
- Kuaishou official Kling 3.0 announcement: https://ir.kuaishou.com/news-releases/news-release-details/kling-ai-launches-30-model-ushering-era-where-everyone-can-be
- ByteDance Seedance 2.0 official page: https://seed.bytedance.com/en/seedance2_0
- ByteDance Seedance 2.0 official launch: https://seed.bytedance.com/blog/seedance-2-0-official-launch
- CapCut Dreamina Seedance 2.0 newsroom: https://www.capcut.com/newsroom/dreamina-seedance-2
- TechCrunch on Seedance 2.0 in CapCut: https://techcrunch.com/2026/03/26/bytedances-new-ai-video-generation-model-dreamina-seedance-2-0-comes-to-capcut/
- Runway Gen-4.5 official announcement: https://runwayml.com/research/introducing-runway-gen-4.5
- Runway Gen-4.5 creation docs: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5
- Runway Gen-4 creation docs: https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video
- Runway Gen-4 prompting guide: https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide
- Runway commercial use FAQ: https://help.runwayml.com/hc/en-us/articles/21668707517587-Can-I-use-the-content-I-made-in-Runway-for-commercial-purposes
- Runway product/model hub: https://runwayml.com/product
- Google DeepMind Veo: https://deepmind.google/models/veo/
- Gemini video generation help: https://support.google.com/gemini/answer/16126339
- Gemini Veo 3.1 video generation page: https://gemini.google/overview/video-generation/
- OpenAI Sora 2 model docs: https://platform.openai.com/docs/models/sora-2
- OpenAI Sora generation docs: https://help.openai.com/en/articles/9957612
- OpenAI Sora responsible launch: https://openai.com/index/launching-sora-responsibly
- Descript product demo page: https://www.descript.com/use-case/product-demo
- Descript advertising video maker: https://www.descript.com/tools/video-ad-maker

## Final Recommendation

For Quest-On, the best path is:

**First experiment: run the same 3 metaphor shots through HappyHorse-1.0, Kling 3.0/Omni, Seedance 2.0, Runway Gen-4.5, Veo 3.1, and Sora 2 only if access is ready.**
**Remotion remains the source of truth for all product UI, Korean copy, proof cards, and final brand sequence.**

This gives the visual lift of AI video without sacrificing the credibility of a real B2B SaaS demo.
