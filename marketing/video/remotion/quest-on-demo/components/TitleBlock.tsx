import type { ReactElement } from "react";
import { COLORS, TYPO } from "../constants";

export interface TitleBlockProps {
  title: string;
  subtitle?: string;
  highlight?: string;
  align?: "left" | "center";
  size?: "lg" | "xl";
}

export function TitleBlock({
  title,
  subtitle,
  highlight,
  align = "left",
  size = "lg",
}: TitleBlockProps): ReactElement {
  const titleSize = size === "xl" ? 124 : 92;
  const subtitleSize = size === "xl" ? 38 : 32;
  // Wider columns let Korean headlines breathe (어절 단위 wrap).
  const titleMaxWidth = align === "center" ? 1620 : 1280;
  const subtitleMaxWidth = align === "center" ? 1320 : 1100;

  return (
    <div style={{ textAlign: align }}>
      <h1
        style={{
          margin: "30px 0 0",
          fontSize: titleSize,
          lineHeight: TYPO.lineHeightTitle,
          fontWeight: 950,
          letterSpacing: TYPO.letterSpacingTight,
          maxWidth: titleMaxWidth,
          // Korean: keep-all preserves word boundaries (어절 단위 줄바꿈)
          wordBreak: "keep-all",
          overflowWrap: "break-word",
        }}
      >
        {title}
        {highlight ? (
          <>
            <br />
            <span
              style={{
                background: COLORS.gradientPrimary,
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              {highlight}
            </span>
          </>
        ) : null}
      </h1>
      {subtitle ? (
        <p
          style={{
            margin: "30px 0 0",
            color: COLORS.muted,
            fontSize: subtitleSize,
            lineHeight: 1.42,
            fontWeight: 650,
            letterSpacing: TYPO.letterSpacingBody,
            maxWidth: subtitleMaxWidth,
            wordBreak: "keep-all",
            overflowWrap: "break-word",
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
