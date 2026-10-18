import type { RenderContext } from "../../types.js";
import type { CalEvent } from "./ics.js";
import { addDays, dayKeyOf, parseInZone } from "./dates.js";

/** Sample events on the days around ctx.now (fixed clock times), used for previews without a real calendar. */
export function demoEvents(ctx: RenderContext): CalEvent[] {
  const today = dayKeyOf(ctx.now, ctx.timeZone);
  const at = (dayOffset: number, hh: number, mm = 0) =>
    parseInZone(`${addDays(today, dayOffset)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, ctx.timeZone);
  const day = (offset: number) => dayKeyOf(at(offset, 12), ctx.timeZone);
  const timed = (title: string, d: number, sh: number, sm: number, eh: number, em: number): CalEvent => ({
    title, start: at(d, sh, sm), end: at(d, eh, em), allDay: false,
  });
  return [
    { title: "Mom's birthday", start: at(0, 0), end: at(1, 0), allDay: true, startDay: day(0), endDay: day(0) },
    timed("Standup", 0, 9, 0, 9, 15),
    timed("1:1 with Jordan — quarterly planning and roadmap review", 0, 10, 30, 11, 30),
    timed("Lunch", 0, 12, 0, 13, 0),
    timed("Dentist", 0, 15, 15, 16, 0),
    timed("School pickup", 0, 15, 30, 16, 15),
    timed("Dinner with Sam & Alex", 0, 19, 0, 21, 30),
    timed("Gym", 1, 7, 0, 8, 0),
    timed("Design review", 1, 10, 0, 11, 30),
    { title: "Team offsite", start: at(2, 0), end: at(4, 0), allDay: true, startDay: day(2), endDay: day(3) },
    timed("Flight to Denver", 2, 21, 15, 23, 50),
    timed("Book club", 3, 18, 30, 20, 0),
  ];
}
