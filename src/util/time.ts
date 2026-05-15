const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diff = now.getTime() - then.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);

  const pick = (): { n: number; unit: string } => {
    if (abs < MIN) return { n: Math.round(abs / SEC), unit: "second" };
    if (abs < HOUR) return { n: Math.round(abs / MIN), unit: "minute" };
    if (abs < DAY) return { n: Math.round(abs / HOUR), unit: "hour" };
    if (abs < WEEK) return { n: Math.round(abs / DAY), unit: "day" };
    if (abs < MONTH) return { n: Math.round(abs / WEEK), unit: "week" };
    if (abs < YEAR) return { n: Math.round(abs / MONTH), unit: "month" };
    return { n: Math.round(abs / YEAR), unit: "year" };
  };

  const { n, unit } = pick();
  const plural = n === 1 ? unit : `${unit}s`;
  return future ? `in ${n} ${plural}` : `${n} ${plural} ago`;
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/\..+$/, "");
}
