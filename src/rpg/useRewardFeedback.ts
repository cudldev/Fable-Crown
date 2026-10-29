import { useEffect, useRef, useState } from "react";
import type { RpgState, SkillId } from "./types";
import type { FeedbackFloater } from "../render/feedback";
import { rewardFeedback } from "./reward-feedback";

export function useRewardFeedback(state: RpgState | null, epoch: number) {
  const baseline = useRef<{ state: RpgState; epoch: number } | null>(null);
  const [floaters, setFloaters] = useState<FeedbackFloater[]>([]);
  const [skill, setSkill] = useState<SkillId>("mining");
  const [gain, setGain] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const expires = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!state) return;
    const previous = baseline.current;
    baseline.current = { state, epoch };
    if (
      !previous ||
      previous.epoch !== epoch ||
      state.tick < previous.state.tick ||
      state.tick - previous.state.tick > 4
    ) {
      setFloaters([]);
      setGain(0);
      setAnnouncement("");
      if (expires.current) clearTimeout(expires.current);
      return;
    }
    const result = rewardFeedback(previous.state, state, performance.now());
    if (!result.floaters.length) return;
    setFloaters((current) =>
      [
        ...current.filter((f) => performance.now() - f.startedAt < 2000),
        ...result.floaters,
      ].slice(-8),
    );
    setAnnouncement(result.announcement);
    const last = Object.entries(result.gains).sort((a, b) => b[1]! - a[1]!)[0];
    if (last) {
      setSkill(last[0] as SkillId);
      setGain(last[1]!);
    }
    if (expires.current) clearTimeout(expires.current);
    expires.current = setTimeout(() => {
      setGain(0);
      setFloaters([]);
    }, 2400);
  }, [state, epoch]);
  useEffect(
    () => () => {
      if (expires.current) clearTimeout(expires.current);
    },
    [],
  );
  return { floaters, skill, gain, announcement };
}
