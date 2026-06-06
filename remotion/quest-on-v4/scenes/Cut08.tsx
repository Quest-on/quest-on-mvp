import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { BoxV4 } from "../components/BoxV4";
import { OrganicCrack } from "../components";
import { TEXT_STREAM_LINES } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 8 — 3.0s. V2 black-box w/ inner-text leak — Korean answer fragments
// scroll dimly inside the closed graphite cube. Crack starts at the leak point.
// 90 frames.
export function Cut08(): ReactElement {
  const frame = useCurrentFrame();

  const dolly = interpolate(frame, [0, 90], [1, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const leakOp = interpolate(frame, [10, 75], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Inner text is barely visible — that's the V2 trick.
  const innerOp = interpolate(frame, [0, 30], [0, 0.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scrollY = (frame * 1.4) % 360;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #050a14 0%, #000 78%)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, transform: `scale(${dolly})` }}>
        <BoxV4 size={480} yawDeg={-22} pitchDeg={18} energy={0.05} />

        {/* Inner text scroll — visible only as faint cobalt */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 320,
            height: 320,
            marginLeft: -160,
            marginTop: -160,
            transform: "translateZ(220px) rotateY(-22deg) rotateX(18deg)",
            overflow: "hidden",
            opacity: innerOp,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              transform: `translateY(${-scrollY}px)`,
              fontFamily: QUESTON_BRAND.fontFamilyMono,
              fontSize: 13,
              lineHeight: "26px",
              color: QUESTON_BRAND.primaryLight,
              padding: "16px 22px",
              whiteSpace: "nowrap",
              mixBlendMode: "screen",
            }}
          >
            {[...TEXT_STREAM_LINES, ...TEXT_STREAM_LINES].map((line, i) => (
              <div key={i} style={{ opacity: 0.55 }}>
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Crack overlay positioned over front face */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 480,
            height: 480,
            marginLeft: -240,
            marginTop: -240,
            transform: "translateZ(240px) rotateY(-22deg) rotateX(18deg)",
          }}
        >
          <OrganicCrack startFrame={0} width={480} height={480} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 50% 40% at 45% 38%, ${QUESTON_BRAND.primaryLight}33, transparent 70%)`,
          opacity: leakOp,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
}
