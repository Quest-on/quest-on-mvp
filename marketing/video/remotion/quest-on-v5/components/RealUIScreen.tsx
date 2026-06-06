import type { CSSProperties, ReactElement } from "react";
import { Img, staticFile } from "remotion";

export type RealUIScreenName =
  | "student-exam"
  | "instructor-grade"
  | "student-join"
  | "student-dashboard"
  | "instructor-dashboard"
  | "landing";

export interface RealUIScreenProps {
  screen: RealUIScreenName;
  // CSS object-fit. cover preserves aspect; contain letterboxes.
  fit?: "cover" | "contain";
  // Multiplicative scale on top of the natural fit.
  scale?: number;
  // Y rotation (deg). Useful for cube-face mounting.
  rotateY?: number;
  // Toggle perspective wrapper for 3D rotations.
  perspective?: boolean;
  // Extra style overrides.
  style?: CSSProperties;
  // If true, no shadow / radius. Used inside a cube face that already styles itself.
  bare?: boolean;
}

export function RealUIScreen({
  screen,
  fit = "cover",
  scale = 1,
  rotateY = 0,
  perspective = false,
  style,
  bare = false,
}: RealUIScreenProps): ReactElement {
  const transform = `${perspective ? "perspective(1400px) " : ""}rotateY(${rotateY}deg) scale(${scale})`;

  return (
    <Img
      src={staticFile(`screens/${screen}.png`)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit,
        objectPosition: "top center",
        transform,
        transformOrigin: "center",
        boxShadow: bare ? undefined : "0 30px 80px rgba(0,0,0,0.6)",
        borderRadius: bare ? 0 : 12,
        willChange: "transform",
        display: "block",
        ...style,
      }}
    />
  );
}
