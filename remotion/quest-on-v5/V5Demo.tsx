import type { ReactElement } from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import "../quest-on-demo/fonts";
import { CUT_DURATIONS, TRANSITION_OVERLAP } from "./data";
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
  V5_FPS,
  V5_WIDTH,
  V5_HEIGHT,
  V5_TOTAL_FRAMES,
} from "./data";

// 21 cuts wired through TransitionSeries. v4 1..16 retained verbatim (with stall fixes
// inside Cut04, Cut07, Cut11, Cut12). 17..21 replace the dead 18s tail with active
// motion: tightened logo reveal, wordmark stagger, real-UI montage, kinetic copy, outro.
//
// Fade overlaps:
//   9 -> 10 : graphite-glass phase hand-off (8f, v4 carry-over)
//   12 -> 13 : full UI -> cube w/ iridescent peak (8f, v4 carry-over)
//   16 -> 17 : particle convergence -> logo (8f, v4 carry-over)
//   18 -> 19 : wordmark -> UI montage (6f, NEW)
//   20 -> 21 : kinetic copy -> outro (6f, NEW)
export function V5Demo(): ReactElement {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
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
