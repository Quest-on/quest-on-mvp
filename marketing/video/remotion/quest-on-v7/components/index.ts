// v7 components — v6 inline mocks upgraded with SSE-style streaming primitives.
// Low-level building blocks (BoxV4, CubeVariant, HandSilhouette, etc.) are
// re-exported from v3/v4 for reuse.

// New streaming primitives (v7).
export { TypingIndicator } from "./TypingIndicator";
export type { TypingIndicatorProps } from "./TypingIndicator";

export { StreamingText } from "./StreamingText";
export type { StreamingTextProps } from "./StreamingText";

export { AIThinking } from "./AIThinking";
export type { AIThinkingProps } from "./AIThinking";

export { ScoreCounter } from "./ScoreCounter";
export type { ScoreCounterProps } from "./ScoreCounter";

export { ProgressBarFill } from "./ProgressBarFill";
export type { ProgressBarFillProps } from "./ProgressBarFill";

export { AIChatBubble } from "./AIChatBubble";
export type { AIChatBubbleProps } from "./AIChatBubble";

export { StudentExamMock } from "./StudentExamMock";
export type { StudentExamMockProps } from "./StudentExamMock";

export { JoinCodeMock } from "./JoinCodeMock";
export type { JoinCodeMockProps } from "./JoinCodeMock";

export { InstructorGradeMock } from "./InstructorGradeMock";
export type { InstructorGradeMockProps } from "./InstructorGradeMock";

export { InstructorExamMock } from "./InstructorExamMock";
export type { InstructorExamMockProps } from "./InstructorExamMock";

export { DomainLabel } from "./DomainLabel";
export type { DomainLabelProps, DomainLabelPosition } from "./DomainLabel";

export { StepCaption } from "./StepCaption";
export type { StepCaptionProps, StepCaptionPosition } from "./StepCaption";

export { CategoryCaption } from "./CategoryCaption";
export type { CategoryCaptionProps } from "./CategoryCaption";

export { UIMontage } from "./UIMontage";
export type { UIMontageProps, MontageScreenKind } from "./UIMontage";

// v7 Three.js cube — replaces CSS 3D BoxV4 on signature beats.
export { ThreeCube } from "./ThreeCube";
export type { ThreeCubeProps } from "./ThreeCube";

// Re-exports from v4.
export { BoxV4 } from "../../quest-on-v4/components/BoxV4";
export type { BoxV4Props } from "../../quest-on-v4/components/BoxV4";

export { CubeVariant } from "../../quest-on-v4/components/CubeVariant";
export type {
  CubeVariantProps,
  CubeVariantKind,
} from "../../quest-on-v4/components/CubeVariant";

export { QuestOnLogo } from "../../quest-on-v4/components/QuestOnLogo";
export type { QuestOnLogoProps } from "../../quest-on-v4/components/QuestOnLogo";

// Re-exports from v3 — components reused as-is.
export {
  OrganicCrack,
  HandSilhouette,
  TextStream,
  ThoughtTrajectory,
  LightParticles,
  WordReveal,
  Timeline,
  InstructorPOV,
  WordmarkFormation,
} from "../../quest-on-v3/components";
