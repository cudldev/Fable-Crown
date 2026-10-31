import { useEffect, useRef, useState } from "react";
import { LIGHTING_PRESETS, type LightingPreset } from "./lighting";
import { colorHex, visualPresetJSON, VISUAL_RANGES, type VisualSettings, type VisualSlider } from "./visual-settings";

interface Props {
  id: string; settings: VisualSettings; preset: LightingPreset; shadows: boolean; gi: boolean; ao: boolean;
  cameraMode: "perspective" | "orthographic";
  onChange: (patch: Partial<VisualSettings>) => void; onShadows: (value: boolean) => void; onGI: (value: boolean) => void; onAO: (value: boolean) => void;
  onReset: () => void; onClose: () => void;
  onPreset: (preset: LightingPreset) => void;
  onCameraMode: (mode: "perspective" | "orthographic") => void;
  performanceReport?: () => string;
}

export default function VisualSettingsPanel({ id, settings, preset, shadows, gi, ao, cameraMode, onChange, onShadows, onGI, onAO, onReset, onClose, onPreset, onCameraMode, performanceReport }: Props) {
  const panel = useRef<HTMLElement>(null);
  const copyArea = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle"), [copyText, setCopyText] = useState("");
  const [copyKind, setCopyKind] = useState<"settings" | "performance">("settings");
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { setCopyState("idle"); setCopyText(""); }, [settings, preset, shadows, gi, ao, cameraMode]);
  useEffect(() => { if (copyState === "manual") { copyArea.current?.focus(); copyArea.current?.select(); } }, [copyState]);
  const copy = async (kind: "settings" | "performance") => {
    const value = kind === "performance" && performanceReport ? performanceReport() : visualPresetJSON({ lighting: preset, shadows, gi, ao, cameraMode, visual: settings });
    setCopyKind(kind);
    setCopyText(value);
    try { await navigator.clipboard.writeText(value); setCopyState("copied"); }
    catch { setCopyState("manual"); }
  };
  const slider = (key: VisualSlider, label: string, suffix = "×") => {
    const [min, max, step] = VISUAL_RANGES[key], value = settings[key];
    const display = key === "aoStrength" || key === "cloudCoverage" ? `${Math.round(value * 100)}%` : suffix === "°" ? `${value.toFixed(1)}°` : key === "shadowBias" ? value.toFixed(4) : `${value.toFixed(key === "aoDistance" || step < .01 ? 3 : step < 1 ? 2 : 0)}${suffix}`;
    return <label className="visual-slider" key={key}><span>{label}<span className="visual-value" aria-hidden="true">{display}</span></span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={event => onChange({ [key]: event.currentTarget.valueAsNumber })} />
    </label>;
  };
  const color = (key: "sunTint" | "ambientTint" | "skyTint", label: string, fallback: number) => <label key={key}>{label}
    <input type="color" aria-label={label} value={settings[key] ?? colorHex(fallback)} onChange={event => onChange({ [key]: event.currentTarget.value })} />
  </label>;
  return <section ref={panel} id={id} className="three-visual-settings" role="dialog" aria-label="Visual settings" aria-modal="false" tabIndex={-1}
    onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <header><div><strong>Visual settings</strong><small data-visual-performance>Live preview</small></div><button type="button" aria-label="Close visual settings" onClick={onClose}>×</button></header>
    <div className="visual-settings-body">
      <fieldset><legend>View</legend>
        <label className="visual-select">Lighting preset<select aria-label="Lighting preset" value={settings.dayNightCycle ? "cycle" : preset} onChange={event => {
          const value = event.currentTarget.value;
          if (value === "cycle") onChange({ dayNightCycle: true });
          else onPreset(value as LightingPreset);
        }}>
          <option value="cycle">Day–night cycle</option><option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option>
        </select></label>
        <label className="visual-select">Camera<select aria-label="Camera projection" value={cameraMode} onChange={event => onCameraMode(event.currentTarget.value as "perspective" | "orthographic")}>
          <option value="perspective">Perspective</option><option value="orthographic">Orthographic</option>
        </select></label>
      </fieldset>
      <fieldset><legend>Lens & world</legend>
        {slider("bloom", "Bloom")}{slider("chromaticAberration", "Chromatic aberration", " px")}
        {slider("lensDistortion", "Lens distortion")}
        {slider("depthOfField", "Depth of field")}{slider("worldCurvature", "World curvature")}
        <small>A gentle glow, subtle barrel distortion and round distant bokeh. Set Lens distortion to 0 to turn it off. Closer zoom lowers the camera slightly and rounds the distant ground.</small>
      </fieldset>
      <fieldset><legend>Sprite lighting</legend>
        {slider("spriteNormalStrength", "Sprite depth")}
        <small>Subtle surface normals react to world lighting. Set to zero for flat pixel shapes.</small>
      </fieldset>
      <fieldset><legend>Lighting</legend>
        <label className="visual-toggle"><input type="checkbox" checked={settings.dayNightCycle} onChange={event => onChange({ dayNightCycle: event.currentTarget.checked })} />Day–night cycle</label>
        {slider("dayTime", "Starting hour", " h")}{slider("cycleMinutes", "Day length", " min")}
        <small>One day takes this many active game minutes. Saved ticks preserve its phase. Fixed lighting buttons pause the cycle.</small>
        {slider("exposure", "Exposure")}{slider("sunStrength", "Sun brightness")}{slider("ambientStrength", "Ambient brightness")}{slider("lampStrength", "Lamp brightness")}
        {slider("colorBalance", "Warm light / cool shadows")}
        {slider("sunAzimuth", "Sun direction", "°")}{slider("sunElevation", "Sun elevation", "°")}
        <div className="visual-colors">{color("sunTint", "Sun tint", LIGHTING_PRESETS[preset].sun)}{color("ambientTint", "Ambient tint", LIGHTING_PRESETS[preset].fill)}{color("skyTint", "Sky color", LIGHTING_PRESETS[preset].sky)}</div>
        <button type="button" onClick={() => onChange({ sunTint: null, ambientTint: null, skyTint: null })}>Use preset colors</button>
      </fieldset>
      <fieldset><legend>Shadows</legend>
        <label className="visual-toggle"><input type="checkbox" checked={shadows} onChange={event => onShadows(event.currentTarget.checked)} />Enable sun shadows</label>
        <label className="visual-select">Shadow resolution<select aria-label="Shadow resolution" value={settings.shadowResolution} onChange={event => onChange({ shadowResolution: Number(event.currentTarget.value) })}>
          <option value={512}>512 · Low</option><option value={1024}>1024 · Default</option><option value={2048}>2048 · High</option>
        </select></label>
        {slider("shadowSoftness", "Shadow softness", "")}{slider("shadowCoverage", "Shadow coverage", " m")}
        <details><summary>Shadow offsets</summary>{slider("shadowBias", "Shadow depth bias", "")}{slider("shadowNormalBias", "Shadow normal bias", " m")}</details>
      </fieldset>
      <fieldset><legend>Indirect light & occlusion</legend>
        <label className="visual-toggle"><input type="checkbox" checked={gi} onChange={event => onGI(event.currentTarget.checked)} />Enable bounced light</label>
        {slider("giStrength", "Bounced light strength")}
        <label className="visual-select">Diffuse bounces<select aria-label="Diffuse bounces" value={settings.giBounces} onChange={event => onChange({ giBounces: Number(event.currentTarget.value) })}>
          <option value={1}>1 · Default</option><option value={2}>2 · Softer fill</option><option value={3}>3 · Compare</option>
        </select></label>
        <label className="visual-toggle"><input type="checkbox" checked={ao} onChange={event => onAO(event.currentTarget.checked)} />Enable ambient occlusion</label>
        {slider("aoStrength", "Occlusion strength", "%")}
        {slider("aoDistance", "AO distance", " m")}
        {slider("contactStrength", "Ground contact shading")}
      </fieldset>
      <fieldset><legend>Water</legend>
        <label className="visual-toggle"><input type="checkbox" checked={settings.waterReflections} onChange={event => onChange({ waterReflections: event.currentTarget.checked })} />Enable water reflections</label>
        {slider("waterReflectionStrength", "Water reflection strength")}{slider("waterRippleStrength", "Water ripples")}
        <label className="visual-select">Reflection resolution<select aria-label="Reflection resolution" value={settings.waterReflectionResolution} onChange={event => onChange({ waterReflectionResolution: Number(event.currentTarget.value) })}>
          <option value={0}>Full render resolution · Default</option><option value={256}>256 · Low</option><option value={512}>512</option><option value={1024}>1024</option><option value={2048}>2048</option><option value={4096}>4096</option>
        </select></label>
        <label className="visual-select">Reflection update rate<select aria-label="Reflection update rate" value={settings.waterReflectionRate} onChange={event => onChange({ waterReflectionRate: Number(event.currentTarget.value) })}>
          <option value={0}>Every frame · Realtime</option><option value={60}>60/sec</option><option value={30}>30/sec</option><option value={15}>15/sec</option><option value={4}>4/sec · Economy</option>
        </select></label>
        <small>Full resolution matches the game render buffer at display density. Numeric options cap the longest edge. Lower resolution or update rates reduce rendering work.</small>
      </fieldset>
      <fieldset><legend>Atmosphere</legend>
        <label className="visual-toggle"><input type="checkbox" checked={settings.skyEnabled} onChange={event => onChange({ skyEnabled: event.currentTarget.checked })} />Enable sky and clouds</label>
        {slider("cloudCoverage", "Cloud coverage")}{slider("cloudSpeed", "Cloud speed")}{slider("cloudScale", "Cloud size")}
        <label className="visual-toggle"><input type="checkbox" checked={settings.fogEnabled} onChange={event => onChange({ fogEnabled: event.currentTarget.checked })} />Enable fog</label>
        {slider("fogReach", "Fog reach", " m")}
        {slider("atmosphereStrength", "Layered ground haze")}
        {slider("lightRays", "Light rays")}
        {slider("fogGradient", "Fog color gradient")}
      </fieldset>
      <fieldset><legend>Vegetation</legend>
        <label className="visual-toggle"><input type="checkbox" checked={settings.foliageEnabled} onChange={event => onChange({ foliageEnabled: event.currentTarget.checked })} />Enable ground foliage</label>
        {slider("foliageDensity", "Foliage density")}{slider("windStrength", "Wind strength")}
        <small>Grass, woodland plants and shoreline reeds. Reduced motion keeps vegetation still.</small>
      </fieldset>
      {copyState !== "idle" && <div className="visual-copy-result"><p aria-live="polite">{copyState === "copied" ? `${copyKind === "performance" ? "Performance report" : "Settings"} copied. Paste into the chat.` : "Select and copy the text below."}</p>
        <textarea ref={copyArea} aria-label={copyKind === "performance" ? "Performance report to copy" : "Settings to copy"} readOnly value={copyText} onFocus={event => event.currentTarget.select()} />
      </div>}
    </div>
    <footer><button type="button" aria-label="Copy settings" onClick={() => void copy("settings")}>{copyState === "copied" && copyKind === "settings" ? "Copied!" : "Copy settings"}</button>
      {performanceReport && <button type="button" aria-label="Copy performance" onClick={() => void copy("performance")}>{copyState === "copied" && copyKind === "performance" ? "Copied!" : "Copy performance"}</button>}
      <button type="button" onClick={onReset}>Reset visual settings</button><button type="button" onClick={onClose}>Done</button></footer>
  </section>;
}
