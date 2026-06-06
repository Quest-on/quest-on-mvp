// v8 components — minimal surface. The film is the particle field plus
// two real-product UI mocks held briefly. Streaming-text primitives are
// retained because the InstructorGradeMock uses them inside its 1.5s
// hold (cuts 11–12).

export { ParticleField } from "./ParticleField";
export type { ParticleFieldProps } from "./ParticleField";

export { StudentExamMock } from "./StudentExamMock";
export type { StudentExamMockProps } from "./StudentExamMock";

export { InstructorGradeMock } from "./InstructorGradeMock";
export type { InstructorGradeMockProps } from "./InstructorGradeMock";

export { TypingIndicator } from "./TypingIndicator";
export { StreamingText } from "./StreamingText";
export { AIThinking } from "./AIThinking";
export { ScoreCounter } from "./ScoreCounter";
export { ProgressBarFill } from "./ProgressBarFill";
export { AIChatBubble } from "./AIChatBubble";
