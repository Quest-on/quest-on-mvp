import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS, EASING, TYPO } from "../../quest-on-demo/constants";
import { COPY } from "../data";

// Cut 18 — 12.0s. Wordmark + sub-copy hold. Breathing scale ±1%.
// Final 1.5s fades all to black. 360 frames.
export function Cut18(): ReactElement {
  const frame = useCurrentFrame();

  const breath = 1 + Math.sin(frame * 0.04) * 0.01;

  const subAppear = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Final fade: last 45f.
  const fadeOut = interpolate(frame, [315, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: fadeOut,
          transform: `scale(${breath})`,
        }}
      >
        {/* Wordmark - simple text since draw already finished in Cut 17 */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "44%",
            transform: "translate(-50%, -50%)",
            fontFamily: TYPO.fontFamily,
            fontSize: 140,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: COLORS.ink,
          }}
        >
          Quest-On
        </div>

        {/* Sub-copy below */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(44% + 110px)",
            transform: "translate(-50%, 0)",
            fontFamily: TYPO.fontFamily,
            fontSize: COPY.cut18.fontSize,
            fontWeight: COPY.cut18.weight,
            letterSpacing: TYPO.letterSpacingBody,
            color: COLORS.muted,
            opacity: subAppear,
            whiteSpace: "nowrap",
          }}
        >
          {COPY.cut18.words[0]}
        </div>
      </div>
    </AbsoluteFill>
  );
}
