/**
 * Parse "YYYY-MM-DDTHH:MM[:SS]" as wall-clock time in `timeZone`. Strings that
 * already carry an offset or "Z" are parsed as-is.
 */
export function parseInZone(local: string, timeZone: string): Date {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(local)) return new Date(local);
  const asUtc = new Date(`${local}Z`);
  // Offset of the zone at (roughly) that instant; re-check once for DST edges.
  const offset = (d: Date) =>
    new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(d.toLocaleString("en-US", { timeZone })).getTime();
  const guess = new Date(asUtc.getTime() + offset(asUtc));
  return new Date(asUtc.getTime() + offset(guess));
}

export function dayKeyOf(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD
  return date.toLocaleDateString("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
