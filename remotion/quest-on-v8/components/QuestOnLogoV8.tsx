// v8-only logo override.
//
// Brief C.3/C.6.6: only two cobalt blues are allowed — #3559C4 (primary)
// and #57CDFF (highlight). The production qstn_logo.svg uses a third
// blue (#2F46B9) AND a sparkle ornament filled with that same #2F46B9.
//
// This file renders ONLY the Q-mark glyph (no sparkle, no third blue),
// with a 2-stop linear gradient from #3559C4 → #57CDFF, exactly the
// two cobalts the brief permits.
//
// The Q path is copied from public/qstn_logo_svg.svg main glyph.

import type { ReactElement } from "react";
import { V8_PALETTE } from "../data";

interface QuestOnLogoV8Props {
  height?: number;
  opacity?: number;
}

export function QuestOnLogoV8({
  height = 360,
  opacity = 1,
}: QuestOnLogoV8Props): ReactElement {
  // Original viewBox is 988x1040; trimming the sparkle leaves the Q-only
  // glyph occupying roughly x:33..955, y:59..981 — i.e. centered on a
  // 922×922 box. We re-frame to that.
  return (
    <svg
      width={height * (922 / 922)}
      height={height}
      viewBox="33 59 922 922"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
    >
      <path
        d="M910.075 873.575L781.96 981.077L492.83 636.506L518 538.5L620.946 529.004L910.075 873.575ZM494 59C748.603 59 955 265.397 955 520C955 616.478 925.362 706.033 874.696 780.06L720.444 596.229C728.585 572.141 733 546.336 733 519.5C733 387.228 625.772 280 493.5 280C361.228 280 254 387.228 254 519.5C254 651.772 361.228 759 493.5 759C511.358 759 528.76 757.044 545.503 753.337L697.075 933.975C635.806 964.087 566.879 981 494 981C239.397 981 33 774.603 33 520C33 265.397 239.397 59 494 59Z"
        fill="url(#v8_logo_grad)"
      />
      <defs>
        <linearGradient
          id="v8_logo_grad"
          x1="33"
          y1="59"
          x2="955"
          y2="981"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={V8_PALETTE.highlight} />
          <stop offset="1" stopColor={V8_PALETTE.primary} />
        </linearGradient>
      </defs>
    </svg>
  );
}
