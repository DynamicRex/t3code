// Pomodoro state: work, then a short break, every 4th break long; work waits for a start.
// Ported from claude-mods/plugins/flow/hooks/pomodoro.ts.

export type Phase = "work" | "short" | "long";
export type Minutes = { work: number; short: number; long: number };
export type Pomodoro = {
  phase: Phase;
  isRunning: boolean;
  endsAt: number;
  leftMs: number;
  breaks: number;
};

export const DEFAULT_MINUTES: Minutes = { work: 30, short: 5, long: 10 };

export function fresh(minutes: Minutes): Pomodoro {
  return { phase: "work", isRunning: false, endsAt: 0, leftMs: minutes.work * 60_000, breaks: 0 };
}

export function remainingMs(pomodoro: Pomodoro, now: number): number {
  return pomodoro.isRunning ? Math.max(0, pomodoro.endsAt - now) : pomodoro.leftMs;
}

export function toggle(pomodoro: Pomodoro, now: number): Pomodoro {
  return pomodoro.isRunning
    ? { ...pomodoro, isRunning: false, leftMs: remainingMs(pomodoro, now) }
    : { ...pomodoro, isRunning: true, endsAt: now + pomodoro.leftMs };
}

// Ends the current phase now: work starts a running break, a break leaves work waiting.
export function skip(pomodoro: Pomodoro, minutes: Minutes, now: number): Pomodoro {
  if (pomodoro.phase !== "work") {
    return { ...pomodoro, phase: "work", isRunning: false, leftMs: minutes.work * 60_000 };
  }
  const breaks = pomodoro.breaks + 1;
  const phase: Phase = breaks % 4 === 0 ? "long" : "short";
  return { phase, isRunning: true, endsAt: now + minutes[phase] * 60_000, leftMs: 0, breaks };
}

// Moves on when the running phase hits zero.
export function tick(pomodoro: Pomodoro, minutes: Minutes, now: number): Pomodoro {
  return pomodoro.isRunning && now >= pomodoro.endsAt
    ? skip(pomodoro, minutes, pomodoro.endsAt)
    : pomodoro;
}

// New lengths: a waiting phase takes its new length at once, a running one keeps going.
export function retime(pomodoro: Pomodoro, minutes: Minutes): Pomodoro {
  return pomodoro.isRunning ? pomodoro : { ...pomodoro, leftMs: minutes[pomodoro.phase] * 60_000 };
}

// Work blocks done in this cycle of four: "●●○○".
export function cycleDots(pomodoro: Pomodoro): string {
  const done = pomodoro.phase === "long" ? 4 : pomodoro.breaks % 4;
  return "●".repeat(done) + "○".repeat(4 - done);
}

export function mmss(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}
