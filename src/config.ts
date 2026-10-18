import type { ScreenConfig } from "./types.js";
import type { CalendarOptions } from "./plugins/calendar/index.js";

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
  // Hide events by title: strings match anywhere, case-insensitive; regexes for anything fancier.
  // e.g. ["Focus time", "OOO", /^Hold:/]
  hideTitles: [],
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
    { plugin: "date" },
  ],
};
