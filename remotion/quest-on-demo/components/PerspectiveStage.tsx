import type { ReactElement, ReactNode } from "react";

export interface PerspectiveStageProps {
  children: ReactNode;
  perspective?: number; // default 1400
  originX?: string; // default "50%"
  originY?: string; // default "55%"
}

export function PerspectiveStage({
  children,
  perspective = 1400,
  originX = "50%",
  originY = "55%",
}: PerspectiveStageProps): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        perspective: `${perspective}px`,
        perspectiveOrigin: `${originX} ${originY}`,
        transformStyle: "preserve-3d",
      }}
    >
      {children}
    </div>
  );
}
