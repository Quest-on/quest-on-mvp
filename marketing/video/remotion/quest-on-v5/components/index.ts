// v5 components — most are re-exports from v4/v3 for code reuse. RealUIScreen
// + UIMontage are new and load real product PNGs via staticFile().

export { RealUIScreen } from "./RealUIScreen";
export type { RealUIScreenProps, RealUIScreenName } from "./RealUIScreen";

export { UIMontage } from "./UIMontage";
export type { UIMontageProps } from "./UIMontage";

// Re-exports from v4 — same component, no behavioural change in v5.
export { BoxV4 } from "../../quest-on-v4/components/BoxV4";
export type { BoxV4Props } from "../../quest-on-v4/components/BoxV4";

export { CubeVariant } from "../../quest-on-v4/components/CubeVariant";
export type {
  CubeVariantProps,
  CubeVariantKind,
} from "../../quest-on-v4/components/CubeVariant";

export { QuestOnLogo } from "../../quest-on-v4/components/QuestOnLogo";
export type { QuestOnLogoProps } from "../../quest-on-v4/components/QuestOnLogo";

// Re-export v3 components reused as-is for v5 cuts.
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
