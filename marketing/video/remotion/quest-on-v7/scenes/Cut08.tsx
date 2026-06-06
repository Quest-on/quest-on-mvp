import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { OrganicCrack, ThreeCube } from "../components";
import { TEXT_STREAM_LINES } from "../data";
import { QUESTON_BRAND } from "../brand";

// Cut 8 — 3.0s. V2 black-box w/ inner-text leak + crack starts. 90 frames.
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
        <ThreeCube
          size={640}
          yawDeg={-22}
          pitchDeg={18}
          energy={0}
          opaqueBlack
        />

        {/* Trapped text — barely-readable cobalt fragments seeping through the
            sealed surface. Sets up the "blackbox hides reasoning" beat.
            iter 21 — re-anchored to size=640 cube (translateZ matches the
            new cube half-size + 1) so text sits flush with the front face
            instead of floating in space. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 480,
            height: 480,
            marginLeft: -240,
            marginTop: -240,
            transform: "translateZ(321px) rotateY(-22deg) rotateX(18deg)",
            overflow: "hidden",
            borderRadius: 12,
            opacity: innerOp,
            pointerEvents: "none",
            mixBlendMode: "screen",
            // Vignette mask so text only "bleeds through" the centre, like
            // light escaping cracks rather than printing on the surface.
            WebkitMaskImage:
              "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 35%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 35%, transparent 65%)",
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
              fontSize: 14,
              lineHeight: "26px",
              color: QUESTON_BRAND.primaryLight,
              padding: "20px 28px",
              whiteSpace: "nowrap",
              filter: "blur(0.4px)",
            }}
          >
            {[...TEXT_STREAM_LINES, ...TEXT_STREAM_LINES].map((line, i) => (
              <div key={i} style={{ opacity: 0.6 }}>
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* OrganicCrack drips — re-anchored to the bigger 640px cube front
            face. translateZ = size/2 = 320 so the SVG sits exactly on the
            cube's front plane, not floating in space. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 640,
            height: 640,
            marginLeft: -320,
            marginTop: -320,
            transform: "translateZ(320px) rotateY(-22deg) rotateX(18deg)",
          }}
        >
          <OrganicCrack startFrame={0} width={640} height={640} />
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

      {/* Black-box question text — hero-sized centered kinetic copy */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 55% at 50% 50%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 55%, transparent 80%)",
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />
      {[
        { text: "AI가 썼나?", delay: 16 },
        { text: "학생이 생각했나?", delay: 26 },
        { text: "구분 불가.", delay: 38, accent: true },
      ].map(({ text, delay, accent }, i) => {
        const enter = interpolate(frame, [delay, delay + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASING.expoOut,
        });
        const exit = interpolate(frame, [68, 80], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: `${38 + i * 12}%`,
              transform: `translate(-50%, -50%) translateY(${(1 - enter) * 24}px)`,
              fontFamily: QUESTON_BRAND.fontFamily,
              fontSize: 88,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: accent ? "transparent" : "rgba(255,255,255,0.95)",
              backgroundImage: accent ? QUESTON_BRAND.brandGradient : undefined,
              WebkitBackgroundClip: accent ? "text" : undefined,
              backgroundClip: accent ? "text" : undefined,
              opacity: enter * exit,
              pointerEvents: "none",
              textShadow: accent
                ? undefined
                : "0 4px 40px rgba(0,0,0,0.6)",
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
