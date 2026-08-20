import { getAppEnv, type AppEnv } from "./app-env";

export const CONSENT_GATE_MODES = ["off", "shadow", "prompt", "enforce"] as const;
export type ConsentGateMode = (typeof CONSENT_GATE_MODES)[number];

export function parseConsentGateMode(
  raw: string | undefined,
  appEnv: AppEnv
): ConsentGateMode {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    if (appEnv === "development") return "off";
    throw new Error("CONSENT_GATE_MODE must be set outside development");
  }
  if (!(CONSENT_GATE_MODES as readonly string[]).includes(normalized)) {
    throw new Error(`CONSENT_GATE_MODE must be one of: ${CONSENT_GATE_MODES.join(", ")}`);
  }
  return normalized as ConsentGateMode;
}

export function getConsentGateMode(): ConsentGateMode {
  return parseConsentGateMode(process.env.CONSENT_GATE_MODE, getAppEnv());
}

export const modeBlocksPages = (mode: ConsentGateMode) => mode === "prompt" || mode === "enforce";
export const modeBlocksApis = (mode: ConsentGateMode) => mode === "enforce";
export const modeCollectsConsent = (mode: ConsentGateMode) => mode === "prompt" || mode === "enforce";
export const modeLogsOnly = (mode: ConsentGateMode) => mode === "shadow";
