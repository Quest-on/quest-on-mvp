import type { ReactElement, ReactNode } from "react";
import { COLORS } from "../constants";

export interface KickerProps {
  children: ReactNode;
  color?: string;
}

export function Kicker({ children, color }: KickerProps): ReactElement {
  const accent = color ?? COLORS.cyan;
  return (
    <div
      style={{
        display: "inline-flex",
        width: "fit-content",
        padding: "10px 16px",
        border: `1px solid ${COLORS.line}`,
        borderRadius: 999,
        color: accent,
        background: "rgba(6,17,31,0.68)",
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </div>
  );
}
