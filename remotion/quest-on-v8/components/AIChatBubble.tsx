import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";
import { StreamingText } from "./StreamingText";
import { TypingIndicator } from "./TypingIndicator";

export interface AIChatBubbleProps {
  // Speaker — drives bubble color, alignment, and presence of the typing indicator.
  role: "student" | "ai";
  // Message body.
  text: string;
  // Frame at which the bubble first appears (after this point the bubble is mounted).
  startFrame: number;
  // Optional time stamp (e.g. "14:32"). Hidden if omitted.
  time?: string;
  // For AI bubbles only: how many frames to show the typing indicator before
  // the streaming reveal begins. Default 18 (~0.6s).
  typingFrames?: number;
  // For AI bubbles only: streaming speed in characters per second. Default 35.
  charsPerSecond?: number;
  // For student bubbles: bubbles "pop in" instantly; this controls the entrance
  // ease length in frames. Default 6.
  studentEntranceFrames?: number;
  // Maximum bubble width as a CSS string. Defaults differ by role.
  maxWidth?: string;
}

// Chat bubble that toggles between an instant-reveal student message (cobalt,
// right-aligned) and an SSE-style AI message (light-gray, left-aligned, typing
// indicator → typewriter). All animation is useCurrentFrame() driven.
export function AIChatBubble({
  role,
  text,
  startFrame,
  time,
  typingFrames = 18,
  charsPerSecond = 35,
  studentEntranceFrames = 6,
  maxWidth,
}: AIChatBubbleProps): ReactElement | null {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;
  if (local < 0) {
    return null;
  }
  const B = QUESTON_BRAND;

  if (role === "student") {
    const enter = interpolate(
      local,
      [0, studentEntranceFrames],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.cubicOut,
      },
    );
    const lift = (1 - enter) * 8;
    const bubbleStyle: CSSProperties = {
      background: B.primary,
      color: "#fff",
      maxWidth: maxWidth ?? "70%",
      borderRadius: 18,
      borderTopRightRadius: 6,
      padding: "14px 20px",
      boxShadow: "0 8px 24px rgba(53,89,196,0.20)",
      fontSize: 15,
      lineHeight: 1.55,
      opacity: enter,
      transform: `translateY(${lift}px)`,
    };
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={bubbleStyle}>
          {text}
          {time ? (
            <div
              style={{
                fontSize: 11,
                opacity: 0.8,
                marginTop: 8,
                textAlign: "right",
              }}
            >
              {time}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // AI bubble: the wrapper appears immediately; typing indicator runs for
  // `typingFrames`, then we hand off to StreamingText. Cursor blinks while
  // streaming and softly pulses after completion.
  const showStream = local >= typingFrames;
  const enter = interpolate(local, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const lift = (1 - enter) * 8;
  const totalChars = Array.from(text).length;
  const streamDurationFrames =
    Math.ceil((totalChars / charsPerSecond) * fps) + 1;
  const cursorVisibleAfter = local < typingFrames + streamDurationFrames + 30;

  const bubbleStyle: CSSProperties = {
    background: "#F5F5F5",
    color: B.ink,
    maxWidth: maxWidth ?? "78%",
    borderRadius: 22,
    borderTopLeftRadius: 8,
    padding: "12px 16px",
    border: "1px solid rgba(0,0,0,0.06)",
    fontSize: 15,
    lineHeight: 1.55,
    opacity: enter,
    transform: `translateY(${lift}px)`,
  };

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={bubbleStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
            fontSize: 12,
            color: B.primary,
            fontWeight: 600,
          }}
        >
          ✨ AI
        </div>
        {showStream ? (
          <StreamingText
            text={text}
            startFrame={startFrame + typingFrames}
            charsPerSecond={charsPerSecond}
            cursor={cursorVisibleAfter}
          />
        ) : (
          <TypingIndicator
            startFrame={startFrame}
            durationFrames={typingFrames}
            size={7}
            style={{ paddingTop: 2, paddingBottom: 2 }}
          />
        )}
        {time ? (
          <div
            style={{
              fontSize: 11,
              color: B.inkMuted,
              marginTop: 6,
            }}
          >
            {time}
          </div>
        ) : null}
      </div>
    </div>
  );
}
