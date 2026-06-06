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
} from "./scenes";

export {
  V3_FPS,
  V3_WIDTH,
  V3_HEIGHT,
  V3_TOTAL_FRAMES,
} from "./data";

// 18 cuts wired through TransitionSeries. Most are hard cuts (Apple-paced).
// 3 cross-fades on the Reveal beats (9->10, 12->13, 16->17).
export function V3Demo(): ReactElement {
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
      </TransitionSeries>
    </AbsoluteFill>
  );
}
