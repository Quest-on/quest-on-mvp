import { Composition } from "remotion";
import {
  QuestOnDemo,
  VIDEO_FPS,
  VIDEO_DURATION_FRAMES,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./quest-on-demo/QuestOnDemo";
import {
  GlassBoxDemo,
  GLASSBOX_FPS,
  GLASSBOX_WIDTH,
  GLASSBOX_HEIGHT,
  GLASSBOX_TOTAL_FRAMES,
} from "./quest-on-glassbox/GlassBoxDemo";
import {
  V3Demo,
  V3_FPS,
  V3_WIDTH,
  V3_HEIGHT,
  V3_TOTAL_FRAMES,
} from "./quest-on-v3/V3Demo";
import {
  V4Demo,
  V4_FPS,
  V4_WIDTH,
  V4_HEIGHT,
  V4_TOTAL_FRAMES,
} from "./quest-on-v4/V4Demo";
import {
  V5Demo,
  V5_FPS,
  V5_WIDTH,
  V5_HEIGHT,
  V5_TOTAL_FRAMES,
} from "./quest-on-v5/V5Demo";
import {
  V6Demo,
  V6_FPS,
  V6_WIDTH,
  V6_HEIGHT,
  V6_TOTAL_FRAMES,
} from "./quest-on-v6/V6Demo";
import {
  V7Demo,
  V7_FPS,
  V7_WIDTH,
  V7_HEIGHT,
  V7_TOTAL_FRAMES,
} from "./quest-on-v7/V7Demo";
import {
  V8Demo,
  V8_FPS,
  V8_WIDTH,
  V8_HEIGHT,
  V8_TOTAL_FRAMES,
} from "./quest-on-v8/V8Demo";
import {
  HybridAd,
  HYBRID_FPS,
  HYBRID_WIDTH,
  HYBRID_HEIGHT,
  HYBRID_TOTAL_FRAMES,
} from "./quest-on-hybrid/HybridAd";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="QuestOnDemo"
        component={QuestOnDemo}
        durationInFrames={VIDEO_DURATION_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Composition
        id="QuestOnGlassBox"
        component={GlassBoxDemo}
        durationInFrames={GLASSBOX_TOTAL_FRAMES}
        fps={GLASSBOX_FPS}
        width={GLASSBOX_WIDTH}
        height={GLASSBOX_HEIGHT}
      />
      <Composition
        id="QuestOnV3"
        component={V3Demo}
        durationInFrames={V3_TOTAL_FRAMES}
        fps={V3_FPS}
        width={V3_WIDTH}
        height={V3_HEIGHT}
      />
      <Composition
        id="QuestOnV4"
        component={V4Demo}
        durationInFrames={V4_TOTAL_FRAMES}
        fps={V4_FPS}
        width={V4_WIDTH}
        height={V4_HEIGHT}
      />
      <Composition
        id="QuestOnV5"
        component={V5Demo}
        durationInFrames={V5_TOTAL_FRAMES}
        fps={V5_FPS}
        width={V5_WIDTH}
        height={V5_HEIGHT}
      />
      <Composition
        id="QuestOnV6"
        component={V6Demo}
        durationInFrames={V6_TOTAL_FRAMES}
        fps={V6_FPS}
        width={V6_WIDTH}
        height={V6_HEIGHT}
      />
      <Composition
        id="QuestOnV7"
        component={V7Demo}
        durationInFrames={V7_TOTAL_FRAMES}
        fps={V7_FPS}
        width={V7_WIDTH}
        height={V7_HEIGHT}
      />
      <Composition
        id="QuestOnV8"
        component={V8Demo}
        durationInFrames={V8_TOTAL_FRAMES}
        fps={V8_FPS}
        width={V8_WIDTH}
        height={V8_HEIGHT}
      />
      <Composition
        id="QuestOnHybridAd"
        component={HybridAd}
        durationInFrames={HYBRID_TOTAL_FRAMES}
        fps={HYBRID_FPS}
        width={HYBRID_WIDTH}
        height={HYBRID_HEIGHT}
      />
    </>
  );
}
