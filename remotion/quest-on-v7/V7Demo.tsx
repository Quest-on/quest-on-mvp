import type { ReactElement } from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import "../quest-on-demo/fonts";
import { CUT_DURATIONS, TRANSITION_OVERLAP, V7_TOTAL_FRAMES } from "./data";
import {
  Cut01,
  Cut02,
  Cut03,
  Cut04,
  Cut05,
  Cut06,
  Cut07,
  Cut08,
  Cut09,
  Cut10,
  Cut11,
  Cut12,
  Cut13,
  Cut14,
  Cut15,
  Cut16,
  Cut17,
  Cut18,
  Cut19,
  Cut20,
  Cut21,
} from "./scenes";

export {
  V7_FPS,
  V7_WIDTH,
  V7_HEIGHT,
  V7_TOTAL_FRAMES,
} from "./data";

// v7 keeps the final 21-cut spine, with a 90-frame outro so Cut21's CTA and
// fade-to-black complete before the render ends.
//
// version-a-iter2 — global BGM via <Audio> with a 6-stage volume envelope
// keyed to architect's per-cut climax map (rubric Fix 4, +G axis).
// Anchors map to the post-transition cut starts of the 1663-frame timeline:
//   cut01-02 lift  (f0→f89   v0.0→0.5)
//   cut03-07 build (f89→f426 v0.5→0.7)
//   cut08-09 climax(f426→f583 v0.7→0.85)
//   cut11-13 dip   (f642→f889 v0.7)  ← UI/voice space
//   cut15-19 peak  (f956→f1489 v0.85→1.0)
//   cut20-21 tail  (f1489→f1663 v1.0→0.0 fade-out)
// Track file: public/audio/bgm.mp3 — see audio/README.md for replacement
// guidance. If no licensed track is available, a silent placeholder is used
// so the render does not break.
function bgmVolume(f: number): number {
  return interpolate(
    f,
    [0, 89, 420, 577, 636, 883, 948, 1479, 1567, V7_TOTAL_FRAMES],
    [0.0, 0.5, 0.7, 0.85, 0.7, 0.7, 0.85, 1.0, 0.6, 0.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

export function V7Demo(): ReactElement {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Audio src={staticFile("audio/bgm.mp3")} volume={bgmVolume} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[0]}>
          <Cut01 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[1]}>
          <Cut02 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[2]}>
          <Cut03 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[3]}>
          <Cut04 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[4]}>
          <Cut05 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[5]}>
          <Cut06 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[6]}>
          <Cut07 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[7]}>
          <Cut08 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[8]}>
          <Cut09 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: TRANSITION_OVERLAP.cut9To10,
          })}
        />
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[9]}>
          <Cut10 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[10]}>
          <Cut11 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[11]}>
          <Cut12 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: TRANSITION_OVERLAP.cut12To13,
          })}
        />
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[12]}>
          <Cut13 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[13]}>
          <Cut14 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[14]}>
          <Cut15 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[15]}>
          <Cut16 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: TRANSITION_OVERLAP.cut16To17,
          })}
        />
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[16]}>
          <Cut17 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[17]}>
          <Cut18 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: TRANSITION_OVERLAP.cut18To19,
          })}
        />
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[18]}>
          <Cut19 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[19]}>
          <Cut20 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: TRANSITION_OVERLAP.cut20To21,
          })}
        />
        <TransitionSeries.Sequence durationInFrames={CUT_DURATIONS[20]}>
          <Cut21 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
