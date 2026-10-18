import type { Plugin, RenderContext } from "../../types.js";
import { loadEvents, type CalEvent } from "./ics.js";
import { demoEvents } from "./demo.js";
import { addDays, dayKeyOf } from "./dates.js";

export interface CalendarOptions {
  icsUrls: string[];
  daysAhead: number;
  hour12: boolean;
  hideDeclined: boolean;
  ownerEmail?: string;
  /** Hide events whose title contains any of these (case-insensitive) or matches the regex. */
  hideTitles?: (string | RegExp)[];
}

interface Row {
  kind: "timed" | "allday";
  title: string;
  start?: Date;
  end?: Date;
  /** Event continues past this day; show the end as a weekday instead of a time. */
  endsLater?: boolean;
  ongoing?: boolean;
}

interface Day {
  key: string; // YYYY-MM-DD in display zone
  rows: Row[];
}

// Fixed heights so we know exactly how much fits before handing off to Satori.
// Note: Satori sizes boxes as content-box, so padding/borders add to width/height.
// Rows use marginBottom for spacing rather than padding inside a fixed height.
const PAD = 12;
const DAY_HEADER = 40;
const TIMED_ROW = 60;
const ALLDAY_ROW = 38;
const GAP = 6;

export const calendarPlugin: Plugin<CalendarOptions, Day[]> = {
  id: "calendar",

  async load(options, ctx) {
    const rangeStart = ctx.now;
    const rangeEnd = new Date(ctx.now.getTime() + (options.daysAhead + 1) * 86_400_000);
    const events = ctx.demo || options.icsUrls.length === 0
      ? demoEvents(ctx)
      : await loadEvents(options.icsUrls, rangeStart, rangeEnd, options.hideDeclined, options.ownerEmail);
    const hidden = (title: string) =>
      options.hideTitles?.some((p) => (typeof p === "string" ? title.toLowerCase().includes(p.toLowerCase()) : p.test(title)));
    return groupByDay(events.filter((e) => !hidden(e.title)), ctx, options.daysAhead);
  },

  render({ data: days, options, size, ctx }) {
    const fmt = timeFormatter(ctx.timeZone, options.hour12);
    const timeCol = options.hour12 ? 120 : 100;

    // Flatten to a list of fixed-height items and take as many as fit.
    type Item = { type: "header"; key: string } | { type: "row"; row: Row } | { type: "empty" };
    const items: Item[] = days.flatMap((d): Item[] => [
      { type: "header", key: d.key },
      ...(d.rows.length ? d.rows.map((row): Item => ({ type: "row", row })) : [{ type: "empty" } as Item]),
    ]);
    const h = (it: Item) => (it.type === "header" ? DAY_HEADER : it.type === "row" ? rowHeight(it.row) : ALLDAY_ROW);
    const avail = size.height - PAD * 2;
    let used = 0;
    let n = 0;
    while (n < items.length) {
      const it = items[n];
      // Never leave a day header orphaned at the bottom.
      const take = it.type === "header" ? 2 : 1;
      const need = items.slice(n, n + take).reduce((sum, x) => sum + h(x), 0);
      // The last row on screen doesn't need its bottom gap.
      if (used + need - GAP > avail) break;
      used += h(it);
      n++;
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: size.width - PAD * 2,
          height: size.height - PAD * 2,
          padding: PAD,
        }}
      >
        {items.slice(0, n).map((it, i) =>
          it.type === "header" ? (
            <DayHeader key={i} dayKey={it.key} ctx={ctx} />
          ) : it.type === "empty" ? (
            <div key={i} style={{ display: "flex", height: ALLDAY_ROW, alignItems: "center", fontSize: 20, marginLeft: 4 }}>
              Nothing else today
            </div>
          ) : it.row.kind === "allday" ? (
            <AllDayRow key={i} row={it.row} timeCol={timeCol} />
          ) : (
            <TimedRow key={i} row={it.row} fmt={fmt} ctx={ctx} timeCol={timeCol} />
          ),
        )}
      </div>
    );
  },
};

const rowHeight = (row: Row | undefined) => (row?.kind === "timed" ? TIMED_ROW : ALLDAY_ROW);

function DayHeader({ dayKey, ctx }: { dayKey: string; ctx: RenderContext }) {
  const today = dayKeyOf(ctx.now, ctx.timeZone);
  const tomorrow = addDays(today, 1);
  const date = new Date(`${dayKey}T12:00:00Z`);
  const md = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const weekday = date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const label = dayKey === today ? "Today" : dayKey === tomorrow ? "Tomorrow" : weekday;
  const sub = dayKey === today || dayKey === tomorrow ? `${weekday.slice(0, 3)}, ${md}` : md;
  return (
    <div
      style={{
        display: "flex",
        height: DAY_HEADER - GAP,
        marginBottom: GAP,
        padding: "0 10px",
        alignItems: "center",
        justifyContent: "space-between",
        background: "black",
        color: "white",
        fontSize: 20,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      <div style={{ display: "flex" }}>{label}</div>
      <div style={{ display: "flex", fontWeight: 700 }}>{sub}</div>
    </div>
  );
}

function TimedRow({ row, fmt, ctx, timeCol }: { row: Row; fmt: TimeFmt; ctx: RenderContext; timeCol: number }) {
  const start = fmt(row.start!);
  const end = row.endsLater ? null : fmt(row.end!);
  const endWeekday = row.endsLater
    ? row.end!.toLocaleDateString("en-US", { weekday: "short", timeZone: ctx.timeZone })
    : null;
  const inv = row.ongoing;
  return (
    <div style={{ display: "flex", height: TIMED_ROW - GAP, marginBottom: GAP }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: timeCol - (inv ? 0 : 4),
          flexShrink: 0,
          background: inv ? "black" : "white",
          color: inv ? "white" : "black",
          border: inv ? "none" : "2px solid black",
        }}
      >
        {/* Start/end stay left-aligned with each other; the pair is centered in the box. */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
            {start.time}
            {start.period && <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 2 }}>{start.period}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 18, fontWeight: 600, marginTop: 3, lineHeight: 1 }}>
            {end ? (
              <>
                {`– ${end.time}`}
                {end.period && <span style={{ fontSize: 13, marginLeft: 1 }}>{end.period}</span>}
              </>
            ) : (
              `→ ${endWeekday}`
            )}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexGrow: 1,
          paddingLeft: 12,
          fontSize: 21,
          fontWeight: 600,
          lineHeight: 1.15,
        }}
      >
        <div style={{ display: "block", lineClamp: 2 }}>{row.title}</div>
      </div>
    </div>
  );
}

function AllDayRow({ row, timeCol }: { row: Row; timeCol: number }) {
  return (
    <div style={{ display: "flex", height: ALLDAY_ROW - GAP, marginBottom: GAP }}>
      <div
        style={{
          display: "flex",
          width: timeCol - 4,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          border: "2px dashed black",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        ALL DAY
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexGrow: 1,
          paddingLeft: 12,
          fontSize: 20,
          fontWeight: 600,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {row.title}
        </div>
      </div>
    </div>
  );
}

// ---------- grouping & dates ----------

function groupByDay(events: CalEvent[], ctx: RenderContext, daysAhead: number): Day[] {
  const today = dayKeyOf(ctx.now, ctx.timeZone);
  const lastDay = addDays(today, daysAhead);
  const days = new Map<string, Day>();
  const dayFor = (key: string) => {
    if (!days.has(key)) days.set(key, { key, rows: [] });
    return days.get(key)!;
  };
  dayFor(today); // always show today, even if empty

  for (const ev of events) {
    if (ev.allDay) {
      // Show multi-day all-day events on each day they cover.
      for (let d = ev.startDay! < today ? today : ev.startDay!; d <= ev.endDay! && d <= lastDay; d = addDays(d, 1)) {
        dayFor(d).rows.push({ kind: "allday", title: ev.title });
      }
      continue;
    }
    if (ev.end <= ctx.now) continue;
    const ongoing = ev.start <= ctx.now;
    const key = ongoing ? today : dayKeyOf(ev.start, ctx.timeZone);
    if (key > lastDay) continue;
    dayFor(key).rows.push({
      kind: "timed",
      title: ev.title,
      start: ev.start,
      end: ev.end,
      ongoing,
      // An event ending exactly at midnight still "ends" that day.
      endsLater: dayKeyOf(new Date(ev.end.getTime() - 1), ctx.timeZone) > key,
    });
  }

  const sorted = [...days.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const day of sorted) {
    day.rows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "allday" ? -1 : 1;
      return (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0) || a.title.localeCompare(b.title);
    });
  }
  return sorted;
}

type TimeFmt = (d: Date) => { time: string; period: string };

function timeFormatter(timeZone: string, hour12: boolean): TimeFmt {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: hour12 ? "h12" : "h23",
  });
  return (d) => {
    const parts = f.formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { time: `${get("hour")}:${get("minute")}`, period: get("dayPeriod").toLowerCase() };
  };
}
