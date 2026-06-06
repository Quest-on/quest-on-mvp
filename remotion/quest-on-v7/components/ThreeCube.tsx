import type { CSSProperties, ReactElement } from "react";
import { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { MeshTransmissionMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { BoxGeometry } from "three";

export interface ThreeCubeProps {
  size?: number;
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  surface?: "graphite" | "glass" | "blueprint";
  energy?: number;
  crystallise?: number;
  scale?: number;
  noise?: boolean;
  frontFace?: ReactElement;
  // Optional explicit opacity for the front-face overlay (0..1).
  // When omitted, defaults to fully opaque so existing scenes are unaffected.
  frontFaceOpacity?: number;
  iridescent?: number;
  opaqueBlack?: boolean;
  // Force the glass/transmission material on regardless of crystallise/surface.
  // Used by Cut 9 to keep the cube readable as glass while a separate ramp
  // (thickness) drives "opaque-thick → transparent-thin" reveal.
  transmission?: number;
  // Glass thickness — when transmission/glass is active, larger values look
  // more opaque/dense, smaller values look thinner/clearer. Defaults to 0.45.
  thickness?: number;
  // Bloom intensity 0..1 — only enable on signature beats.
  bloom?: number;
  style?: CSSProperties;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

const DEG = Math.PI / 180;

interface CubeMeshProps {
  surface: "graphite" | "glass" | "blueprint";
  energy: number;
  crystallise: number;
  iridescent: number;
  opaqueBlack: boolean;
  forceTransmission: boolean;
  thickness: number;
  yaw: number;
  pitch: number;
  roll: number;
}

function CubeMesh({
  surface,
  energy,
  crystallise,
  iridescent,
  opaqueBlack,
  forceTransmission,
  thickness,
  yaw,
  pitch,
  roll,
}: CubeMeshProps): ReactElement {
  const isGlass =
    forceTransmission ||
    surface === "glass" ||
    (surface === "graphite" && crystallise >= 0.55);
  const isBlueprint = surface === "blueprint";
  const isOpaque = opaqueBlack && surface === "graphite" && crystallise < 0.55;

  // iter 22 — graphite was reading as outline-only across cuts 03/04/05/06/10.
  // Lift base color further into mid-cobalt so PBR lighting actually carves
  // visible faces, and bump emissive band so the cube has self-glow even when
  // direct light is grazing.
  const graphiteColor = isOpaque ? "#0a0e1a" : "#2c3f6e";
  const irid = clamp(iridescent, 0, 1);
  // When iridescent peaks, push thickness band wider so the spectral shift
  // covers the visible faces and reads as a rainbow rim instead of a thin
  // halo. iter 21 fix.
  const iridThicknessLo = lerp(100, 200, irid);
  const iridThicknessHi = lerp(400, 800, irid);

  return (
    <group rotation={[pitch * DEG, yaw * DEG, roll * DEG]}>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        {isBlueprint ? (
          <meshBasicMaterial color="#3559C4" wireframe />
        ) : isGlass ? (
          <MeshTransmissionMaterial
            transmission={1}
            thickness={thickness}
            ior={1.4}
            chromaticAberration={0.05 + irid * 0.18}
            roughness={0.05}
            samples={4}
            backside
            color={"#cfe1ff"}
            attenuationColor={"#3559C4"}
            attenuationDistance={2.0}
            iridescence={irid}
            iridescenceIOR={lerp(1.3, 1.5, irid)}
            iridescenceThicknessRange={[iridThicknessLo, iridThicknessHi]}
            clearcoat={lerp(0.5, 1, irid)}
            clearcoatRoughness={lerp(0.25, 0.05, irid)}
            // iter 21 fix — when iridescent peaks, raise emissive so the
            // rainbow surface read survives even against a near-black
            // backdrop (transmission alone would just transmit blackness).
            emissive={"#5b8cff"}
            emissiveIntensity={irid * 0.45}
          />
        ) : (
          <meshPhysicalMaterial
            color={graphiteColor}
            roughness={isOpaque ? 0.85 : lerp(0.45, 0.22, energy)}
            metalness={isOpaque ? 0.1 : lerp(0.35, 0.65, energy)}
            iridescence={irid}
            iridescenceIOR={lerp(1.3, 1.5, irid)}
            iridescenceThicknessRange={[iridThicknessLo, iridThicknessHi]}
            clearcoat={isOpaque ? 0 : lerp(0.5, 1, irid)}
            clearcoatRoughness={lerp(0.25, 0.05, irid)}
            emissive={"#2a3d6e"}
            emissiveIntensity={isOpaque ? 0.0 : 0.32 + energy * 0.32}
          />
        )}
      </mesh>
      {/* Cobalt rim edge — line segments along the 12 cube edges only.
          Mimics the CSS rim-glow without showing triangulation diagonals. */}
      {!isBlueprint ? (
        <lineSegments scale={1.002}>
          <edgesGeometry args={[new BoxGeometry(1, 1, 1)]} />
          <lineBasicMaterial
            color={isGlass ? "#9cc4ff" : isOpaque ? "#3a4a78" : "#6f9cff"}
            transparent
            opacity={isOpaque ? 0.22 : 0.55 + energy * 0.25}
          />
        </lineSegments>
      ) : null}
    </group>
  );
}

export function ThreeCube({
  size = 480,
  yawDeg = -22,
  pitchDeg = 18,
  rollDeg = 0,
  surface = "graphite",
  energy = 0,
  crystallise = 0,
  scale = 1,
  frontFace,
  frontFaceOpacity = 1,
  iridescent = 0,
  opaqueBlack = false,
  transmission = 0,
  thickness = 0.45,
  bloom = 0,
  style,
}: ThreeCubeProps): ReactElement {
  // Pad the canvas a bit beyond the cube so bloom plumes don't clip at edges.
  const pad = Math.round(size * 0.6);
  const canvasSize = size + pad;
  const half = canvasSize / 2;

  // Pick camera distance so the cube projects at roughly the requested px size.
  // With FOV=35deg, the cube of unit-size at distance D fills h = 2 D tan(17.5).
  // We want h_pixels = size and canvas height = canvasSize. So h_pixels/canvasSize
  // = 2 tan(17.5) / (2 D tan(17.5) ÷ unit) — simpler: D such that
  // size/canvasSize = 1 / (2 D tan(17.5)). Solve D = canvasSize / (2 size tan(17.5)).
  const fov = 35;
  const cameraZ = canvasSize / (2 * size * Math.tan((fov / 2) * DEG));

  // iter 22 — the HTML frontFace overlay used to be `size` pixels, which
  // matched the projection of the cube's CENTER. But the cube's front face
  // sits at z=+0.5 in cube space, so it projects larger by cameraZ/(cameraZ-0.5).
  // Without this correction the overlay reads as a tile floating *inside* a
  // visibly bigger 3D cube outline (Cut 11/13 visible mismatch).
  const frontFacePx = Math.round(size * (cameraZ / (cameraZ - 0.5)));
  const frontFaceHalf = frontFacePx / 2;

  const camera = useMemo(
    () => ({
      position: [0, 0, cameraZ] as [number, number, number],
      fov,
      near: 0.1,
      far: 100,
    }),
    [cameraZ],
  );

  const bloomEnabled = bloom > 0.01;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: canvasSize,
        height: canvasSize,
        marginLeft: -half,
        marginTop: -half,
        transform: `scale(${scale})`,
        ...style,
      }}
    >
      <ThreeCanvas
        width={canvasSize}
        height={canvasSize}
        camera={camera}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        }}
        style={{ background: "transparent" }}
      >
        {/* Three-point lighting tuned for cobalt-on-near-black brand.
            iter 21 — strengthened key + added cobalt fill + cyan front
            accent so edge contrast survives PBR shading the way the CSS
            BoxV4 implicit edge gradient used to. */}
        <ambientLight intensity={0.45} />
        {/* Key light — bright warm white from above-right. */}
        <directionalLight
          position={[2.5, 3.5, 4]}
          intensity={2.4 + energy * 0.6}
          color={"#ffffff"}
        />
        {/* Fill — cool sky white from upper-left. */}
        <directionalLight
          position={[-3, 2, 2.5]}
          intensity={1.05}
          color={"#cfe1ff"}
        />
        {/* Cobalt fill — saturated cobalt from the left to push brand
            colour into the side faces. */}
        <directionalLight
          position={[-2, 1.2, 0.8]}
          intensity={0.85}
          color={"#3559C4"}
        />
        {/* Front cyan accent — small front pop so the front face does not
            disappear into the dark background when the cube is graphite.
            Skipped on opaque-black cube (Cut 8) so the sealed blackbox stays
            sealed. */}
        {!opaqueBlack ? (
          <pointLight
            position={[0, 0, 2.4]}
            intensity={0.8}
            color={"#57CDFF"}
            distance={8}
            decay={2}
          />
        ) : null}
        {/* Rim — saturated cobalt from below/back to carve the edges. */}
        <directionalLight
          position={[0, -1.5, -3]}
          intensity={1.1 + iridescent * 0.5}
          color={"#3559C4"}
        />
        {/* Hemisphere fill — sky/ground bias for PBR/iridescence reflections. */}
        <hemisphereLight args={["#a5c8ff", "#050811", 0.55]} />

        {/* Iridescent peak rim light — surfaces the spectral shift so the
            chroma streaks read on faces, not just at the silhouette. */}
        {iridescent > 0.01 ? (
          <pointLight
            position={[2, 2, 2]}
            intensity={2 * iridescent}
            color={"#ffffff"}
            distance={12}
            decay={2}
          />
        ) : null}

        <CubeMesh
          surface={surface}
          energy={energy}
          crystallise={crystallise}
          iridescent={iridescent}
          opaqueBlack={opaqueBlack}
          forceTransmission={transmission > 0.01}
          thickness={thickness}
          yaw={yawDeg}
          pitch={pitchDeg}
          roll={rollDeg}
        />

        {bloomEnabled ? (
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.35}
              luminanceSmoothing={0.4}
              intensity={bloom * 1.4}
              mipmapBlur
            />
          </EffectComposer>
        ) : null}
      </ThreeCanvas>

      {/* HTML front-face overlay — kept as DOM so Korean text stays crisp.
          Honors frontFaceOpacity so callers can fade it during iridescent /
          glass-peak windows where a solid white tile would occlude the
          spectral shift on the cube faces. */}
      {frontFace && frontFaceOpacity > 0.001 ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: frontFacePx,
            height: frontFacePx,
            marginLeft: -frontFaceHalf,
            marginTop: -frontFaceHalf,
            transform: `rotateX(${pitchDeg}deg) rotateY(${yawDeg}deg) rotateZ(${rollDeg}deg) translateZ(${frontFaceHalf + 2}px)`,
            transformStyle: "preserve-3d",
            borderRadius: 14,
            overflow: "hidden",
            pointerEvents: "none",
            opacity: clamp(frontFaceOpacity, 0, 1),
          }}
        >
          {frontFace}
        </div>
      ) : null}
    </div>
  );
}
