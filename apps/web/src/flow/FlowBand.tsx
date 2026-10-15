// Focus band at the top of the composer card: pomodoro, next Dubai prayer, punch-in.
// Ported from claude-mods/plugins/flow. State lives in this client's localStorage.

import { RotateCcwIcon, Settings2Icon, SkipForwardIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

import chimeUrl from "./chime.wav?url";
import {
  DEFAULT_MINUTES,
  backToFocus,
  cycleDots,
  fresh,
  mmss,
  remainingMs,
  retime,
  skip,
  tick,
  toggle,
  type Minutes,
  type Pomodoro,
} from "./pomodoro";
import { gstClock, nextPrayer } from "./prayer";

type Shared = { pomodoro: Pomodoro; minutes: Minutes; punchedAt: number | null };
type Action = (shared: Shared, now: number) => Shared;

const STORAGE_KEY = "t3code:flow";
const CHECKLIST = "water · phone away · distraction window closed · prayed";
const LOOK = {
  work: { label: "Focus", color: "#f7768e" },
  short: { label: "Break", color: "#9ece6a" },
  long: { label: "Long break", color: "#bb9af7" },
};
const FLOW_COLOR = "#e0af68";

const toggleTimer: Action = (shared, now) => ({
  ...shared,
  pomodoro: toggle(shared.pomodoro, now),
});
const skipPhase: Action = (shared, now) => ({
  ...shared,
  pomodoro: skip(shared.pomodoro, shared.minutes, now),
});
const backFromBreak: Action = (shared) => ({
  ...shared,
  pomodoro: backToFocus(shared.pomodoro, shared.minutes),
});
const resetTimer: Action = (shared) => ({ ...shared, pomodoro: fresh(shared.minutes) });
const togglePunch: Action = (shared, now) => ({
  ...shared,
  punchedAt: shared.punchedAt === null ? now : null,
});

export function FlowBand() {
  const [view, setView] = useState(() => ({ now: Date.now(), shared: load() }));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // What this client last saw, so a change by the clock or another window alerts once.
  const seenPhaseRef = useRef(phaseKey(view.shared));
  const seenPrayerAtRef = useRef(nextPrayer(view.now).at);

  const change = useCallback((action: Action) => {
    const now = Date.now();
    const shared = action(load(), now);
    save(shared);
    seenPhaseRef.current = phaseKey(shared);
    setView({ now, shared });
    return shared;
  }, []);

  useEffect(() => {
    const everySecond = () => {
      const now = Date.now();
      const stored = load();
      const shared = { ...stored, pomodoro: tick(stored.pomodoro, stored.minutes, now) };
      if (shared.pomodoro !== stored.pomodoro) save(shared);

      const phase = phaseKey(shared);
      if (phase !== seenPhaseRef.current) {
        notify(
          shared.pomodoro.phase === "work"
            ? "Break over · press Start to focus"
            : "Get up, move, drink water",
          15_000,
        );
      }
      seenPhaseRef.current = phase;

      const prayer = nextPrayer(now);
      if (prayer.at !== seenPrayerAtRef.current) {
        const arrivedAt = seenPrayerAtRef.current;
        notify(`${nextPrayer(arrivedAt - 1).name} time · ${gstClock(arrivedAt)}`, 30_000);
      }
      seenPrayerAtRef.current = prayer.at;

      setView({ now, shared });
    };
    const intervalId = window.setInterval(everySecond, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const punch = () => {
    const shared = change(togglePunch);
    if (shared.punchedAt !== null) notify(`In flow · ${CHECKLIST}`, 10_000);
  };

  const setMinutes = (field: keyof Minutes, value: string) => {
    const rounded = Math.round(Number(value));
    if (!(rounded >= 1 && rounded <= 180)) return;
    change((shared) => {
      const minutes = { ...shared.minutes, [field]: rounded };
      return { ...shared, minutes, pomodoro: retime(shared.pomodoro, minutes) };
    });
  };

  const { now, shared } = view;
  const { pomodoro, minutes, punchedAt } = shared;
  const look = LOOK[pomodoro.phase];
  const prayer = nextPrayer(now);

  // The composer card's top row, inset to line up with the prompt text. One line from `sm` up:
  // timer and controls left, prayer and flow right, the prayer text truncating before anything
  // wraps. Narrower screens wrap whole groups instead.
  return (
    <div className="flex flex-col gap-1 ps-4 pe-3 pt-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:flex-nowrap">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: look.color }}>
              {look.label}
            </span>
            {/* Muted while paused; the toggle's Start / Continue / Pause says the rest. */}
            <span
              className={cn(
                "tabular-nums",
                pomodoro.isRunning ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {mmss(remainingMs(pomodoro, now))}
            </span>
            <span className="opacity-60" style={{ color: look.color }}>
              {cycleDots(pomodoro)}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button size="xs" variant="outline" onClick={() => change(toggleTimer)}>
              {startLabel(pomodoro, minutes)}
            </Button>
            {pomodoro.phase === "work" && (
              <Button size="xs" variant="ghost" onClick={() => change(skipPhase)}>
                Break
              </Button>
            )}
            {pomodoro.phase !== "work" && (
              <Button size="xs" variant="ghost" onClick={() => change(backFromBreak)}>
                Back to focus
              </Button>
            )}
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Skip"
              title="Skip"
              onClick={() => change(skipPhase)}
            >
              <SkipForwardIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Reset"
              title="Reset"
              onClick={() => change(resetTimer)}
            >
              <RotateCcwIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Timer settings"
              title="Timer settings"
              onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
            >
              <Settings2Icon />
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 truncate">
            {prayer.name} {gstClock(prayer.at)}{" "}
            <span className="text-muted-foreground">in {untilText(prayer.at - now)}</span>
          </span>
          {punchedAt === null ? (
            <Button className="shrink-0" size="xs" variant="ghost-muted" onClick={punch}>
              Punch in
            </Button>
          ) : (
            <Button className="shrink-0" size="xs" variant="ghost" onClick={punch}>
              <span style={{ color: FLOW_COLOR }}>⚡ In flow</span>
              <span className="text-muted-foreground">{gstClock(punchedAt)}</span>
            </Button>
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          {(["work", "short", "long"] as const).map((field) => (
            <label key={field} className="flex items-center gap-1">
              {field === "work" ? "Focus" : field === "short" ? "Break" : "Long"} min
              <input
                type="number"
                min={1}
                max={180}
                defaultValue={minutes[field]}
                onBlur={(event) => setMinutes(field, event.currentTarget.value)}
                className="w-14 rounded border border-input bg-transparent px-1 text-foreground"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function load(): Shared {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return JSON.parse(stored) as Shared;
  } catch {
    // Fall through to defaults.
  }
  return { pomodoro: fresh(DEFAULT_MINUTES), minutes: DEFAULT_MINUTES, punchedAt: null };
}

function save(shared: Shared): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shared));
  } catch {
    // Storage unavailable: the band still works for this session.
  }
}

function notify(message: string, timeoutMs: number): void {
  toastManager.add({ type: "info", title: message, timeout: timeoutMs });
  void new Audio(chimeUrl).play().catch(() => {});
}

// "Continue" when focus waits part-way through a block.
function startLabel(pomodoro: Pomodoro, minutes: Minutes): string {
  if (pomodoro.isRunning) return "Pause";
  return pomodoro.phase === "work" && pomodoro.leftMs < minutes.work * 60_000
    ? "Continue"
    : "Start";
}

function phaseKey(shared: Shared): string {
  return `${shared.pomodoro.phase}:${shared.pomodoro.breaks}`;
}

// "2h 14m", or "14m" under an hour.
function untilText(milliseconds: number): string {
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  return totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
    : `${totalMinutes}m`;
}
