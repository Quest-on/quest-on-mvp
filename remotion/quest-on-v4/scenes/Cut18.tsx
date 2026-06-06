import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { COLORS, TYPO } from "../../quest-on-demo/constants";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 18 — 12.0s. Logo + sub-copy hold. V9 breathing scale ±1%.
// Final 1.5s fades all to black. 360 frames.
export function Cut18(): ReactElement {
  const frame = useCurrentFrame();

  const breath = 1 + Math.sin(frame * 0.04) * 0.01;

  const subAppear = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

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
        {/* Wordmark — already drawn in Cut 17, simple text now */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "44%",
            transform: "translate(-50%, -50%)",
            fontFamily: QUESTON_BRAND.fontFamily,
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
            fontFamily: QUESTON_BRAND.fontFamily,
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
