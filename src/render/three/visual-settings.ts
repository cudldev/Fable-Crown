export interface VisualSettings {
  renderStyle: "smooth";
  spriteNormalStrength: number;
  exposure: number; sunStrength: number; ambientStrength: number; lampStrength: number;
  sunAzimuth: number; sunElevation: number;
  sunTint: string | null; ambientTint: string | null; skyTint: string | null;
  shadowResolution: number; shadowSoftness: number; shadowCoverage: number; shadowBias: number; shadowNormalBias: number;
  giStrength: number; aoStrength: number; aoDistance: number; fogEnabled: boolean; fogReach: number;
  waterReflections: boolean; waterReflectionStrength: number; waterRippleStrength: number; waterReflectionResolution: number; waterReflectionRate: number;
  skyEnabled: boolean; cloudCoverage: number; cloudSpeed: number; cloudScale: number;
  foliageEnabled: boolean; foliageDensity: number; windStrength: number;
}
export const DEFAULT_VISUAL_SETTINGS: Readonly<VisualSettings> = Object.freeze({
  renderStyle: "smooth", spriteNormalStrength: .35,
  exposure: 1.05, sunStrength: 1, ambientStrength: 1, lampStrength: 1,
  sunAzimuth: 23.3, sunElevation: 62.3,
  sunTint: null, ambientTint: null, skyTint: null,
  shadowResolution: 2048, shadowSoftness: 3.5, shadowCoverage: 79, shadowBias: -.003, shadowNormalBias: .055,
  giStrength: 1.3, aoStrength: 1, aoDistance: .125, fogEnabled: true, fogReach: 60,
  waterReflections: true, waterReflectionStrength: .65, waterRippleStrength: .35, waterReflectionResolution: 0, waterReflectionRate: 0,
  skyEnabled: true, cloudCoverage: .55, cloudSpeed: 1, cloudScale: 1,
  foliageEnabled: true, foliageDensity: .7, windStrength: 1,
});
export const VISUAL_RANGES = {
  spriteNormalStrength: [0, 1, .05],
  exposure: [.35, 2, .05], sunStrength: [0, 3, .05], ambientStrength: [0, 3, .05], lampStrength: [0, 3, .05],
  sunAzimuth: [0, 360, .1], sunElevation: [5, 85, .1], shadowSoftness: [0, 5, .1], shadowCoverage: [16, 80, 1],
  shadowBias: [-.005, .005, .0001], shadowNormalBias: [0, .3, .005], giStrength: [0, 2, .05], aoStrength: [0, 1, .05], aoDistance: [.125, 8, .125], fogReach: [20, 160, 5],
  waterReflectionStrength: [0, 1, .05], waterRippleStrength: [0, 1, .05],
  cloudCoverage: [0, 1, .05], cloudSpeed: [0, 3, .1], cloudScale: [.5, 2, .1],
  foliageDensity: [0, 1, .05], windStrength: [0, 2, .1],
} as const;
export type VisualSlider = keyof typeof VISUAL_RANGES;

export function normalizeVisualSettings(input: Partial<VisualSettings>): VisualSettings {
  const result: VisualSettings = { ...DEFAULT_VISUAL_SETTINGS };
  for (const key of Object.keys(VISUAL_RANGES) as VisualSlider[]) {
    const value = input[key], [min, max] = VISUAL_RANGES[key];
    if (typeof value === "number" && Number.isFinite(value)) result[key] = Math.max(min, Math.min(max, value));
  }
  for (const key of ["sunTint", "ambientTint", "skyTint"] as const) if (typeof input[key] === "string" && /^#[0-9a-f]{6}$/i.test(input[key]!)) result[key] = input[key]!.toLowerCase();
  if ([512, 1024, 2048].includes(input.shadowResolution ?? 0)) result.shadowResolution = input.shadowResolution!;
  if (typeof input.fogEnabled === "boolean") result.fogEnabled = input.fogEnabled;
  if (typeof input.waterReflections === "boolean") result.waterReflections = input.waterReflections;
  if (typeof input.skyEnabled === "boolean") result.skyEnabled = input.skyEnabled;
  if (typeof input.foliageEnabled === "boolean") result.foliageEnabled = input.foliageEnabled;
  if ([0, 256, 512, 1024, 2048, 4096].includes(input.waterReflectionResolution ?? -1)) result.waterReflectionResolution = input.waterReflectionResolution!;
  if ([0, 4, 15, 30, 60].includes(input.waterReflectionRate ?? -1)) result.waterReflectionRate = input.waterReflectionRate!;
  // Older copied presets may contain a pixelated style; rendering now always uses display resolution.
  return result;
}

export function sunDirection(settings: Readonly<VisualSettings>): [number, number, number] {
  const azimuth = settings.sunAzimuth * Math.PI / 180, elevation = settings.sunElevation * Math.PI / 180;
  return [Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)];
}

/** Transport/visibility inputs: display and strength sliders must not rebake the cache. */
export function transportSettingsKey(settings: Readonly<VisualSettings>): string {
  return JSON.stringify([settings.sunStrength, settings.ambientStrength, settings.lampStrength, settings.sunAzimuth, settings.sunElevation, settings.sunTint, settings.ambientTint, settings.aoDistance]);
}
export const colorHex = (color: number) => "#" + color.toString(16).padStart(6, "0");

export interface VisualPresetControls {
  lighting: "day" | "dusk" | "night"; shadows: boolean; gi: boolean; ao: boolean;
  cameraMode: "perspective" | "orthographic"; visual: Readonly<VisualSettings>;
}
export const DEFAULT_VISUAL_PRESET: Readonly<VisualPresetControls> = Object.freeze({
  lighting: "dusk", shadows: true, gi: true, ao: true, cameraMode: "perspective", visual: DEFAULT_VISUAL_SETTINGS,
});
export function visualPresetJSON(controls: VisualPresetControls): string {
  return JSON.stringify({ type: "fable-crown.visual-settings", version: 1, ...controls, visual: normalizeVisualSettings(controls.visual) }, null, 2);
}
