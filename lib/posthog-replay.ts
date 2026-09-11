import type { PostHogConfig } from "posthog-js";
import { sanitizeAnalyticsUrl } from "@/lib/website-analytics";

/** Native rrweb masking runs before snapshots leave the browser. */
export const sessionReplayConfig: NonNullable<PostHogConfig["session_recording"]> = {
  maskAllInputs: true,
  maskTextSelector: "*",
  // Keep native layout/classes, but never serialize arbitrary DOM attributes.
  maskAttributeFn: (name, value, element) => {
    if (name === "class") return value;
    if (name === "_cssText" && ["LINK", "STYLE"].includes(element?.tagName ?? "")) return value;
    if (name === "rel" && value === "stylesheet") return value;
    if (["type", "role", "width", "height", "colspan", "rowspan"].includes(name) && /^[a-z0-9 -]+$/i.test(value)) return value;
    if (name === "style") return value.split(";").filter(rule =>
      /^\s*(?:width|height|min-width|max-width|min-height|max-height|top|left|right|bottom|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|transform|display|position|opacity|z-index|color|background-color|text-align)\s*:\s*[a-z0-9#%()., +\-]+$/i.test(rule)
    ).join(";");
    if (name === "href" && element?.tagName === "LINK" && element.getAttribute("rel") === "stylesheet") {
      try {
        const url = new URL(value, window.location.origin);
        if (url.origin === window.location.origin && url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".css")) return url.origin + url.pathname;
      } catch { /* omit non-stylesheet URLs */ }
    }
    return "";
  },
  blockSelector: 'img, picture, video, audio, canvas, iframe, object, embed, svg image, [contenteditable], .monaco-editor, .ph-no-capture, [data-private], [style*="url("]',
  recordCrossOriginIframes: false,
  recordHeaders: false,
  recordBody: false,
  captureCanvas: { recordCanvas: false },
  captureJsonLd: false,
  // The SDK also uses this callback for replay's page URL and timeline.
  maskCapturedNetworkRequestFn: request => {
    if (typeof request.name !== "string") return null;
    const name = sanitizeAnalyticsUrl(request.name);
    return name ? { name, duration: 0, entryType: "navigation", startTime: 0 } : null;
  },
};

const SNAPSHOT_KEYS = new Set([
  "token", "distinct_id", "$session_id", "$window_id", "$snapshot_data",
  "$snapshot_bytes", "$snapshot_host", "$lib", "$lib_version", "$config_defaults",
]);

/** Replay has a separate rrweb envelope; the analytics scalar filter would destroy it. */
export function replayProperties(input: Record<string, unknown>, environment: string): Record<string, unknown> {
  return { ...Object.fromEntries(Object.entries(input).filter(([key]) => SNAPSHOT_KEYS.has(key))), environment };
}
