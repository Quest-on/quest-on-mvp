import type { ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING, COLORS } from "../../quest-on-demo/constants";
import { COPY } from "../data";
import { QUESTON_BRAND } from "../brand";
import { LightParticles } from "../components";

// Cut 21 — 3.0s outro CTA (version-a-iter1 — was 2.0s).
// Beat plan (frames @ 30fps, cut-local):
//   0-22  : Quest-On wordmark hero, halo settles, particles drift
//   18-50 : tagline "결과보다, 과정입니다." fades in below wordmark
//   38-72 : URL "quest-on.app" rises to monospace + glowing underline
//   78-90 : whole frame fades to black for clean tail-out
export function Cut21(): ReactElement {
  const frame = useCurrentFrame();

  // Tagline fade-in (mid-cut).
  const taglineFade = interpolate(frame, [18, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const taglineRise = interpolate(frame, [18, 38], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });

  // URL rise.
  const urlFade = interpolate(frame, [38, 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const urlRise = interpolate(frame, [38, 62], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  // Underline width grows after URL is fully in.
  const underlineWidth = interpolate(frame, [50, 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicInOut,
  });

  // Final fade-to-black on the whole frame.
  const fade = interpolate(frame, [78, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div style={{ position: "absolute", inset: 0, opacity: fade }}>
        {/* Drifting starfield — extended to cover the longer 90-frame outro
            so the closing beat never goes dead. */}
        <div style={{ opacity: 0.5 }}>
          <LightParticles
            startFrame={-30}
            count={28}
            mode="drift"
            width={1920}
            height={1080}
            color={QUESTON_BRAND.primaryLight}
          />
        </div>

        {/* Single static halo for atmospheric depth. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 900,
            height: 400,
            marginLeft: -450,
            marginTop: -200,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${QUESTON_BRAND.primaryLight}33 0%, transparent 70%)`,
            filter: "blur(50px)",
            opacity: 0.5,
            pointerEvents: "none",
          }}
        />

        {/* Quest-On wordmark hero. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "40%",
            transform: "translate(-50%, -50%) scale(0.97)",
            fontFamily: QUESTON_BRAND.fontFamily,
            fontSize: 140,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: COLORS.ink,
            lineHeight: 1,
          }}
        >
          Quest-On
        </div>

        {/* Tagline — value proposition. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(40% + 110px)",
            transform: `translate(-50%, ${taglineRise}px)`,
            fontFamily: QUESTON_BRAND.fontFamily,
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: "-0.005em",
            color: "rgba(232, 240, 252, 0.78)",
            opacity: taglineFade,
            whiteSpace: "nowrap",
          }}
        >
          답이 아닌, 사고입니다.
        </div>

        {/* URL CTA — monospace, larger, glowing underline. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(40% + 180px)",
            transform: `translate(-50%, ${urlRise}px)`,
            fontFamily: QUESTON_BRAND.fontFamilyMono,
            fontSize: COPY.cut21.urlSize,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: QUESTON_BRAND.primaryLight,
            opacity: urlFade,
            whiteSpace: "nowrap",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            textShadow: `0 0 24px ${QUESTON_BRAND.primaryLight}66, 0 0 48px ${QUESTON_BRAND.primary}44`,
          }}
        >
          <span>{COPY.cut21.url}</span>
          <span
            style={{
              width: `${underlineWidth * 100}%`,
              height: 2,
              background: `linear-gradient(90deg, transparent 0%, ${QUESTON_BRAND.primaryLight} 50%, transparent 100%)`,
              opacity: 0.9 * urlFade,
              boxShadow: `0 0 12px ${QUESTON_BRAND.primaryLight}, 0 0 24px ${QUESTON_BRAND.primary}`,
              borderRadius: 1,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
