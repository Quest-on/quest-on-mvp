import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

export interface QuestOnLogoProps {
  // Width in px. Height auto from 988x1040 viewBox.
  size?: number;
  // 0..1 reveal (drives stroke draw + fill fade-in).
  startFrame?: number;
  durationFrames?: number;
  // If true, render only the inline SVG path (not the wordmark text).
  iconOnly?: boolean;
  // Wordmark text. Default "Quest-On".
  wordmark?: string;
  wordmarkSize?: number;
}

// Inline reproduction of /Users/cigro/Yeongjun/quest-on/public/qstn_logo_svg.svg.
// Path 1 = main C + tail glyph (gradient #57CDFF -> #2F46B9).
// Path 2 = sparkle (4-pointed star, fill #2F46B9).
const LOGO_PATH_C =
  "M910.075 873.575L781.96 981.077L492.83 636.506L518 538.5L620.946 529.004L910.075 873.575ZM494 59C748.603 59 955 265.397 955 520C955 616.478 925.362 706.033 874.696 780.06L720.444 596.229C728.585 572.141 733 546.336 733 519.5C733 387.228 625.772 280 493.5 280C361.228 280 254 387.228 254 519.5C254 651.772 361.228 759 493.5 759C511.358 759 528.76 757.044 545.503 753.337L697.075 933.975C635.806 964.087 566.879 981 494 981C239.397 981 33 774.603 33 520C33 265.397 239.397 59 494 59Z";

const LOGO_PATH_STAR =
  "M779.5 0C782.927 113.15 859.529 203.939 955 208C859.529 212.061 782.927 302.85 779.5 416C776.073 302.85 699.471 212.061 604 208C699.471 203.939 776.073 113.15 779.5 0Z";

export function QuestOnLogo({
  size = 220,
  startFrame = 0,
  durationFrames = 60,
  iconOnly = false,
  wordmark = "Quest-On",
  wordmarkSize = 140,
}: QuestOnLogoProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Stroke draw 0..0.6, fill 0.4..1.
  const strokeT = interpolate(local, [0, durationFrames * 0.65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const fillT = interpolate(
    local,
    [durationFrames * 0.4, durationFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  const strokeOpacity = interpolate(
    local,
    [0, 6, durationFrames * 0.7, durationFrames],
    [0, 1, 1, 0.3],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const dashTotal = 6500;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
      }}
    >
      <svg
        width={size}
        height={size * (1040 / 988)}
        viewBox="0 0 988 1040"
        style={{
          overflow: "visible",
          filter: `drop-shadow(0 8px 32px rgba(53,89,196,${0.35 * fillT}))`,
        }}
      >
        <defs>
          <linearGradient
            id="qlogo-grad"
            x1="33"
            y1="59"
            x2="955"
            y2="981"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={QUESTON_BRAND.primaryLight} />
            <stop offset="1" stopColor={QUESTON_BRAND.primaryDeep} />
          </linearGradient>
        </defs>
        {/* Stroke draw (cobalt outline) */}
        <path
          d={LOGO_PATH_C}
          fill="none"
          stroke={QUESTON_BRAND.primaryLight}
          strokeWidth={6}
          strokeDasharray={dashTotal}
          strokeDashoffset={(1 - strokeT) * dashTotal}
          opacity={strokeOpacity}
        />
        <path
          d={LOGO_PATH_STAR}
          fill="none"
          stroke={QUESTON_BRAND.primaryDeep}
          strokeWidth={6}
          strokeDasharray={dashTotal}
          strokeDashoffset={(1 - strokeT) * dashTotal}
          opacity={strokeOpacity}
        />
        {/* Fill */}
        <path d={LOGO_PATH_C} fill="url(#qlogo-grad)" opacity={fillT} />
        <path d={LOGO_PATH_STAR} fill={QUESTON_BRAND.primaryDeep} opacity={fillT} />
      </svg>

      {!iconOnly ? (
        <span
          style={{
            fontFamily: QUESTON_BRAND.fontFamily,
            fontSize: wordmarkSize,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: QUESTON_BRAND.inkInverse,
            opacity: fillT,
            transform: `translateY(${(1 - fillT) * 14}px)`,
            lineHeight: 1,
          }}
        >
          {wordmark}
        </span>
      ) : null}
    </div>
  );
}
