import type { ScreenConfig } from "./types.js";
import type { CalendarOptions } from "./plugins/calendar/index.js";
import type { TodoistOptions } from "./plugins/todoist/index.js";

/** Comma-separated; `/pattern/flags` entries become regexes, everything else is a plain substring. */
function parseHideTitles(raw: string): (string | RegExp)[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^\/(.+)\/([a-z]*)$/);
      return m ? new RegExp(m[1], m[2]) : s;
    });
}

const calendar: CalendarOptions = {
  icsUrls: (process.env.GCAL_ICS_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  daysAhead: 7,
  hour12: false,
  hideDeclined: true,
  // Whose RSVPs count. Google names primary calendars after the owner's email, so
  // this is detected per feed; set GCAL_EMAIL only if detection doesn't work.
  ownerEmail: process.env.GCAL_EMAIL || undefined,
  // Hide events by title; set HIDE_TITLES in .env (titles can be private, and the repo is public).
  hideTitles: parseHideTitles(process.env.HIDE_TITLES ?? ""),
  // Hour grid of today's events down the right edge (first event − 1h to last + 1h, at least 9–18).
  timeline: true,
};

// p1/p2 tasks under the date; the date fills the column when there are none.
const todoist: TodoistOptions = {
  token: process.env.TODOIST_TOKEN ?? "",
};

export const config: ScreenConfig = {
  // TRMNL OG
  width: 800,
  height: 480,
  // Defaults to this machine's zone. Set TZ_DISPLAY when deploying (servers are usually UTC).
  timeZone: process.env.TZ_DISPLAY || Intl.DateTimeFormat().resolvedOptions().timeZone,
  bitDepth: 2,
  slots: [
    { plugin: "calendar", options: calendar },
    { stack: [{ plugin: "date" }, { plugin: "todoist", options: todoist }] },
  ],
};
