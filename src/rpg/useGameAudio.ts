import { useEffect, useRef, useState } from "react";
import type { RpgState } from "./types";
import { objectById } from "./world";
type Settings = { muted: boolean; volume: number };
const defaults: Settings = { muted: false, volume: 0.15 };
export function useGameAudio(state: RpgState | null, epoch: number) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("fable-audio-v1") ?? "null");
      return s && typeof s.muted === "boolean" && typeof s.volume === "number"
        ? { muted: s.muted, volume: Math.max(0, Math.min(1, s.volume)) }
        : defaults;
    } catch {
      return defaults;
    }
  });
  const [unlocked, setUnlocked] = useState(false),
    [available, setAvailable] = useState(true);
  const ctx = useRef<AudioContext | null>(null),
    master = useRef<GainNode | null>(null),
    wind = useRef<AudioBufferSourceNode | null>(null),
    filter = useRef<BiquadFilterNode | null>(null);
  const previous = useRef<{ state: RpgState; epoch: number } | null>(null),
    current = useRef(settings);
  current.current = settings;
  useEffect(() => {
    try {
      localStorage.setItem("fable-audio-v1", JSON.stringify(settings));
    } catch {}
    if (master.current && ctx.current)
      master.current.gain.setTargetAtTime(
        settings.muted ? 0 : settings.volume,
        ctx.current.currentTime,
        0.03,
      );
  }, [settings]);
  useEffect(() => {
    const unlock = () => {
      if (ctx.current) return;
      try {
        if (typeof AudioContext === "undefined") {
          setAvailable(false);
          return;
        }
        const c = new AudioContext();
        ctx.current = c;
        const gain = c.createGain();
        master.current = gain;
        gain.gain.value = current.current.muted ? 0 : current.current.volume;
        gain.connect(c.destination);
        const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++)
          data[i] = (Math.random() * 2 - 1) * 0.035;
        const source = c.createBufferSource(),
          low = c.createBiquadFilter();
        source.buffer = noise;
        source.loop = true;
        low.type = "lowpass";
        low.frequency.value = 350;
        source.connect(low);
        low.connect(gain);
        source.start();
        wind.current = source;
        filter.current = low;
        void c
          .resume()
          .then(() => setUnlocked(true))
          .catch(() => setAvailable(false));
      } catch {
        setAvailable(false);
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      wind.current?.stop();
      void ctx.current?.close();
      ctx.current = null;
    };
  }, []);
  function tone(
    frequency: number,
    duration = 0.08,
    delay = 0,
    type: OscillatorType = "sine",
  ) {
    const c = ctx.current,
      g = master.current;
    if (!c || !g || settings.muted || c.state !== "running") return;
    const oscillator = c.createOscillator(),
      envelope = c.createGain(),
      start = c.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(35, frequency * 0.65),
      start + duration,
    );
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.12, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(g);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
  useEffect(() => {
    if (!state) return;
    const prior = previous.current;
    previous.current = { state, epoch };
    if (
      !prior ||
      prior.epoch !== epoch ||
      state.tick <= prior.state.tick ||
      state.tick - prior.state.tick > 4
    )
      return;
    const p = state.player,
      old = prior.state.player,
      steps = Math.max(
        Math.abs(p.position.x - old.position.x),
        Math.abs(p.position.y - old.position.y),
      );
    if (steps > 0 && steps <= 2) {
      tone(95, 0.045);
      if (steps === 2) tone(115, 0.045, 0.16);
    }
    if (
      p.action &&
      (!old.action ||
        p.action.remaining > old.action.remaining ||
        p.action.targetId !== old.action.targetId)
    ) {
      const kind = objectById(p.action.targetId ?? "")?.kind;
      tone(
        p.action.kind === "craft"
          ? 620
          : p.action.kind === "fight"
            ? 160
            : kind === "rock"
              ? 1050
              : kind === "tree"
                ? 270
                : 190,
        0.075,
        0,
        "triangle",
      );
    }
    const seen = new Set(prior.state.rewards?.map((r) => r.id));
    if (state.rewards?.some((r) => !seen.has(r.id))) {
      tone(880, 0.09);
      tone(1175, 0.12, 0.07);
    }
    if (p.health < old.health) tone(130, 0.12, 0, "triangle");
    if (filter.current && ctx.current)
      filter.current.frequency.setTargetAtTime(
        Math.abs(p.position.x - 119) < 7 ? 700 : 250,
        ctx.current.currentTime,
        0.8,
      );
  }, [state, epoch, unlocked]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) void ctx.current?.suspend();
      else if (unlocked) void ctx.current?.resume();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [unlocked]);
  return {
    settings,
    unlocked,
    available,
    setMuted: (muted: boolean) => setSettings((s) => ({ ...s, muted })),
    setVolume: (volume: number) =>
      setSettings((s) => ({ ...s, volume: Math.max(0, Math.min(1, volume)) })),
  };
}
