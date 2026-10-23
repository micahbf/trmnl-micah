import ICAL from "ical.js";

export interface CalEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** For all-day events: "YYYY-MM-DD" (inclusive) — no timezone conversion. */
  startDay?: string;
  endDay?: string;
}

const cache = new Map<string, { at: number; text: string }>();
const CACHE_MS = 5 * 60 * 1000;

async function fetchIcs(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Calendar fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  cache.set(url, { at: Date.now(), text });
  return text;
}

export async function loadEvents(
  urls: string[],
  rangeStart: Date,
  rangeEnd: Date,
  hideDeclined: boolean,
  ownerEmail?: string,
): Promise<CalEvent[]> {
  const texts = await Promise.all(urls.map(fetchIcs));
  return texts.flatMap((t) => parseIcs(t, rangeStart, rangeEnd, hideDeclined, ownerEmail));
}

export function parseIcs(
  text: string,
  rangeStart: Date,
  rangeEnd: Date,
  hideDeclined = false,
  ownerEmail?: string,
): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  // Google sets X-WR-CALNAME to the owner's address on primary calendars.
  const calName = String(root.getFirstPropertyValue("x-wr-calname") ?? "");
  const me = ownerEmail ?? (calName.includes("@") ? calName : undefined);
  const hideDeclinedFor = hideDeclined ? me : undefined;
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(new ICAL.Timezone(tz));
  }

  // `exceptions: []` stops each Event from scanning every VEVENT in the feed and
  // relating all RECURRENCE-IDs regardless of UID: O(n²), ~20 s on a Pi for a
  // 2000-event feed, and it could swap in another series' exception. We relate
  // them by UID below.
  const all = root.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v, { exceptions: [] }));
  const masters = new Map<string, ICAL.Event>();
  for (const ev of all) if (!ev.isRecurrenceException()) masters.set(ev.uid, ev);
  for (const ev of all) {
    if (ev.isRecurrenceException()) masters.get(ev.uid)?.relateException(ev);
  }

  const out: CalEvent[] = [];
  const push = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (isCancelled(item) || (hideDeclinedFor && isDeclined(item, hideDeclinedFor))) return;
    const s = start.toJSDate();
    const e = end.toJSDate();
    if (e <= rangeStart || s >= rangeEnd) return;
    const ev: CalEvent = { title: item.summary || "(No title)", start: s, end: e, allDay: start.isDate };
    if (start.isDate) {
      ev.startDay = dayString(start);
      const last = end.clone();
      last.adjust(-1, 0, 0, 0); // DTEND is exclusive for all-day events
      ev.endDay = dayString(last);
    }
    out.push(ev);
  };

  // Exceptions are handled through their master; orphans (master outside the
  // feed) are emitted as standalone events.
  for (const ev of all) {
    if (ev.isRecurrenceException() && !masters.has(ev.uid)) push(ev, ev.startDate, ev.endDate);
  }

  for (const ev of masters.values()) {
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate);
      continue;
    }
    const it = ev.iterator();
    for (let next = it.next(), guard = 0; next && guard < 50_000; next = it.next(), guard++) {
      if (next.toJSDate() >= rangeEnd) break;
      const occ = ev.getOccurrenceDetails(next);
      push(occ.item, occ.startDate, occ.endDate);
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayString = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

function isCancelled(ev: ICAL.Event) {
  return String(ev.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";
}

function isDeclined(ev: ICAL.Event, email: string) {
  const me = `mailto:${email.toLowerCase()}`;
  return ev.attendees.some(
    (a) =>
      String(a.getFirstValue()).toLowerCase() === me &&
      String(a.getParameter("partstat")).toUpperCase() === "DECLINED",
  );
}
