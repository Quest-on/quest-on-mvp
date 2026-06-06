import type { CSSProperties, ReactElement } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../constants";

export interface GradientMeshProps {
  intensity?: number;
  tone?: "cool" | "warm";
}

interface Blob {
  color: string;
  baseX: number;
  baseY: number;
  amplitudeX: number;
  amplitudeY: number;
  size: number;
  periodFrames: number;
  phase: number;
}

// Off-axis lighting: blobs pulled to corners so no single centred radial dominates.
const COOL_BLOBS: Blob[] = [
  {
    color: "rgba(59,130,246,0.42)",
    baseX: 8,
    baseY: 12,
    amplitudeX: 5,
    amplitudeY: 4,
    size: 52,
    periodFrames: 360,
    phase: 0,
  },
  {
    color: "rgba(34,211,238,0.34)",
    baseX: 92,
    baseY: 18,
    amplitudeX: 4,
    amplitudeY: 5,
    size: 46,
    periodFrames: 300,
    phase: Math.PI * 0.66,
  },
  {
    color: "rgba(52,211,153,0.28)",
    baseX: 88,
    baseY: 92,
    amplitudeX: 6,
    amplitudeY: 3,
    size: 50,
    periodFrames: 240,
    phase: Math.PI,
  },
];

const WARM_BLOBS: Blob[] = [
  {
    color: "rgba(167,139,250,0.42)",
    baseX: 10,
    baseY: 20,
    amplitudeX: 5,
    amplitudeY: 4,
    size: 50,
    periodFrames: 360,
    phase: 0,
  },
  {
    color: "rgba(34,211,238,0.32)",
    baseX: 90,
    baseY: 14,
    amplitudeX: 4,
    amplitudeY: 5,
    size: 48,
    periodFrames: 300,
    phase: Math.PI * 0.5,
  },
  {
    color: "rgba(251,191,36,0.24)",
    baseX: 88,
    baseY: 88,
    amplitudeX: 5,
    amplitudeY: 4,
    size: 46,
    periodFrames: 240,
    phase: Math.PI,
  },
];

export function GradientMesh({
  intensity = 1,
  tone = "cool",
}: GradientMeshProps): ReactElement {
  const frame = useCurrentFrame();
  const blobs = tone === "warm" ? WARM_BLOBS : COOL_BLOBS;

  const layers = blobs.map((blob, index) => {
    const t = (frame / blob.periodFrames) * Math.PI * 2 + blob.phase;
    const x = blob.baseX + Math.sin(t) * blob.amplitudeX;
    const y = blob.baseY + Math.cos(t) * blob.amplitudeY;
    const fade = interpolate(
      Math.sin(t),
      [-1, 1],
      [0.78, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.smoothOut,
      },
    );
    const style: CSSProperties = {
      position: "absolute",
      inset: 0,
      backgroundImage: `radial-gradient(circle at ${x}% ${y}%, ${blob.color}, transparent ${blob.size}%)`,
      opacity: intensity * fade,
      mixBlendMode: "screen",
    };
    return <div key={index} style={style} />;
  });

  return <AbsoluteFill>{layers}</AbsoluteFill>;
}
