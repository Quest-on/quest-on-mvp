import type { CSSProperties, ReactElement, ReactNode } from "react";
import { COLORS } from "../constants";

export interface BrowserFrameProps {
  children: ReactNode;
  title: string;
  accent?: string;
  style?: CSSProperties;
}

export function BrowserFrame({
  children,
  title,
  accent,
  style,
}: BrowserFrameProps): ReactElement {
  const titleColor = accent ?? COLORS.muted;
  return (
    <div
      style={{
        border: `1px solid ${COLORS.line}`,
        borderRadius: 26,
        background: "rgba(15,23,42,0.82)",
        boxShadow: "0 26px 90px rgba(0,0,0,0.36)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          height: 58,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 22px",
          borderBottom: `1px solid ${COLORS.line}`,
          color: titleColor,
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: "-0.01em",
        }}
      >
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 999,
            background: COLORS.red,
          }}
        />
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 999,
            background: COLORS.amber,
          }}
        />
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 999,
            background: COLORS.mint,
          }}
        />
        <span style={{ marginLeft: 12 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
