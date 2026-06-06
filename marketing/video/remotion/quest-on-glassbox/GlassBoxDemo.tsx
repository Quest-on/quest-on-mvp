import { AbsoluteFill } from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import "../quest-on-demo/fonts";
import { GLASSBOX_DURATIONS, GLASSBOX_TRANSITIONS } from "./data";
import {
  VoidScene,
  FractureScene,
  CrystallizeScene,
  ConstellationScene,
} from "./scenes";

export {
  GLASSBOX_FPS,
  GLASSBOX_WIDTH,
  GLASSBOX_HEIGHT,
  GLASSBOX_TOTAL_FRAMES,
} from "./data";

// Total: void(420) + fracture(360) + crystallize(540) + constellation(380) = 1700f.
// Transition overlap: 8 + 8 + 2 = 18f. Effective length = 1682f.
export const GlassBoxDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={GLASSBOX_DURATIONS.void}>
          <VoidScene />
        </TransitionSeries.Sequence>

        {/* Match-cut on the box. Short fade keeps the box geometry continuous. */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: GLASSBOX_TRANSITIONS.voidToFracture,
          })}
        />

        <TransitionSeries.Sequence durationInFrames={GLASSBOX_DURATIONS.fracture}>
          <FractureScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: GLASSBOX_TRANSITIONS.fractureToCrystallize,
          })}
        />

        <TransitionSeries.Sequence
          durationInFrames={GLASSBOX_DURATIONS.crystallize}
        >
          <CrystallizeScene />
        </TransitionSeries.Sequence>

        {/* The white flash lives inside ConstellationScene's first frame. */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({
            durationInFrames: GLASSBOX_TRANSITIONS.crystallizeToConstellation,
          })}
        />

        <TransitionSeries.Sequence
          durationInFrames={GLASSBOX_DURATIONS.constellation}
        >
          <ConstellationScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
