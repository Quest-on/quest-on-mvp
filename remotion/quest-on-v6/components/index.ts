// v6 components — inline JSX UI mocks (no PNG <Img>) + DomainLabel + UIMontage.
// Most low-level building blocks (BoxV4, CubeVariant, HandSilhouette, etc.) are
// re-exported from v3/v4 for reuse.

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

export { UIMontage } from "./UIMontage";
export type { UIMontageProps, MontageScreenKind } from "./UIMontage";

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
