export type MemoryEnvironment = Record<string, string | undefined>;

export type MemoryFlags = Readonly<{
  extractionEnabled: boolean;
  storageEnabled: boolean;
  selectionEnabled: boolean;
  renderingEnabled: boolean;
  injectionEnabled: boolean;
  scorePathInjectionEnabled: boolean;
  quarantinedExtractorVersion: string | null;
}>;

/**
 * Emergency switches accept only the documented value "1". Unknown values
 * resolve to the feature's shadow-safe default instead of changing behaviour.
 */
export function readMemoryFlags(
  env: MemoryEnvironment = process.env,
): MemoryFlags {
  const quarantinedVersion = env.MEMORY_QUARANTINED_EXTRACTOR_VERSION?.trim();

  return Object.freeze({
    extractionEnabled: env.MEMORY_EXTRACTION_DISABLED !== "1",
    storageEnabled: env.MEMORY_STORAGE_DISABLED !== "1",
    selectionEnabled: env.MEMORY_SELECTION_DISABLED !== "1",
    renderingEnabled: env.MEMORY_RENDERING_DISABLED !== "1",
    injectionEnabled: env.MEMORY_INJECTION_ENABLED === "1",
    scorePathInjectionEnabled: env.MEMORY_SCORE_PATH_INJECTION_ENABLED === "1",
    quarantinedExtractorVersion: quarantinedVersion || null,
  });
}

/** A score-producing prompt requires both the broad and narrow switches. */
export function memoryInjectionEnabled(
  scorePath: boolean,
  env: MemoryEnvironment = process.env,
): boolean {
  const flags = readMemoryFlags(env);
  return (
    flags.injectionEnabled &&
    (!scorePath || flags.scorePathInjectionEnabled)
  );
}
