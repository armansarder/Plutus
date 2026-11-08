import { format } from "date-fns";

/** Date-only helpers. All dates travel as "YYYY-MM-DD" strings and are computed in UTC to avoid timezone drift. */
export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parts(value: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = value.split("-").map(Number);
  return [y, m, d];
}

export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [y, m, d] = parts(value);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtc(value: string): Date {
  const [y, m, d] = parts(value);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(value: string, days: number): string {
  const dt = toUtc(value);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

/** Format a date-only string for display without timezone shifts. */
export function formatDateOnly(value: string, pattern = "MMM d"): string {
  const [y, m, d] = parts(value);
  return format(new Date(y, m - 1, d), pattern);
}
