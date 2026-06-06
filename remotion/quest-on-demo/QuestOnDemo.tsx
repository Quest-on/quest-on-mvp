import { AbsoluteFill } from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";

import "./fonts";
import { SCENE_DURATIONS, TRANSITION_DURATIONS } from "./constants";
import {
  HookScene,
  ProblemScene,
  InstructorScene,
  StudentScene,
  EvidenceScene,
  WowScene,
  CTAScene,
} from "./scenes";

export {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FPS,
  VIDEO_DURATION_FRAMES,
} from "./constants";

export const QuestOnDemo: React.FC = () => {
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.hook}>
          <HookScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATIONS.fast })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.problem}>
          <ProblemScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATIONS.fast })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.instructor}>
          <InstructorScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATIONS.fast })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.student}>
          <StudentScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATIONS.fast })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.evidence}>
          <EvidenceScene />
        </TransitionSeries.Sequence>

        {/* Drama beat into the wow moment — wipe from bottom is more cinematic than fade */}
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-bottom" })}
          timing={springTiming({
            config: { damping: 22, stiffness: 100, mass: 1 },
            durationInFrames: TRANSITION_DURATIONS.normal,
          })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.wow}>
          <WowScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATIONS.fast })}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.cta}>
          <CTAScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/*
        Audio slots (uncomment after dropping tracks into public/audio/):
          <Audio src={staticFile("audio/bgm.mp3")} volume={0.35} />
          <Sequence from={WOW_IMPACT_FRAME}>
            <Audio src={staticFile("audio/impact-subbass.mp3")} />
          </Sequence>
        WOW_IMPACT_FRAME = sum(hook+problem+instructor+student+evidence transitions) + 55 within wow
      */}
    </AbsoluteFill>
  );
};
