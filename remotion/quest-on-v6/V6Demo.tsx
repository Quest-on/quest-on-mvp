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
  V6_FPS,
  V6_WIDTH,
  V6_HEIGHT,
  V6_TOTAL_FRAMES,
} from "./data";

// 21 cuts wired through TransitionSeries. v5 spine retained 1:1; v6 changes
// are confined to:
//   - inline JSX UI mocks replacing PNG screenshots (Cut 11, 12, 19)
//   - 학생 / 강사 domain labels (Cut 3, 10)
//   - 존댓말 copy (Cut 4, 7, 15, 18, 20)
export function V6Demo(): ReactElement {
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
