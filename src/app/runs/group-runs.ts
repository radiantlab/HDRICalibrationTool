import type { RunRecord } from "@/lib/run-history";

export interface RunGroup {
  label: string;
  runs: RunRecord[];
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function labelFor(key: string, todayKey: string, yesterdayKey: string) {
  if (key === todayKey) {
    return "Today";
  }
  if (key === yesterdayKey) {
    return "Yesterday";
  }
  return key;
}

/**
 * Groups runs by day, newest first, with friendly labels for the last two days.
 *
 * `today` is a parameter rather than read from the clock so the labelling is
 * testable.
 */
export function groupRunsByDay(runs: RunRecord[], today: Date): RunGroup[] {
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const byDay = new Map<string, RunRecord[]>();
  for (const record of runs) {
    const key = dayKey(record.startedAt);
    byDay.set(key, [...(byDay.get(key) ?? []), record]);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, dayRuns]) => ({
      label: labelFor(key, todayKey, yesterdayKey),
      runs: [...dayRuns].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
    }));
}
