import type { Plugin, RenderContext } from "../../types.js";
import { loadEvents, type CalEvent } from "./ics.js";
import { demoEvents } from "./demo.js";
import { addDays, dayKeyOf, parseInZone } from "./dates.js";

export interface CalendarOptions {
  icsUrls: string[];
  daysAhead: number;
  hour12: boolean;
  hideDeclined: boolean;
  ownerEmail?: string;
  /** Hide events whose title contains any of these (case-insensitive) or matches the regex. */
  hideTitles?: (string | RegExp)[];
  /** Thin hour grid of today's events on the right edge, spanning the first event − 1h to the last + 1h. */
  timeline?: boolean;
}

interface Row {
  kind: "timed" | "allday";
  title: string;
  start?: Date;
  end?: Date;
  /** Event continues past this day; show the end as a weekday instead of a time. */
  endsLater?: boolean;
  ongoing?: boolean;
  /** Starts before an earlier event on the same day has ended. */
  overlapsEarlier?: boolean;
}

interface Day {
  key: string; // YYYY-MM-DD in display zone
  rows: Row[];
}

interface CalData {
  days: Day[];
  /** All of today's timed events, including ones already over, for the timeline. */
  today: { start: Date; end: Date }[];
}

// Fixed heights so we know exactly how much fits before handing off to Satori.
// Note: Satori sizes boxes as content-box, so padding/borders add to width/height.
// Rows use marginBottom for spacing rather than padding inside a fixed height.
const PAD = 12;
const DAY_HEADER = 40;
const TIMED_ROW = 60;
const ALLDAY_ROW = 38;
const GAP = 6;
const TIMELINE_BARS = 20;
const BAR_GAP = 2; // between back-to-back events, so the boundary reads over a gridline
const FRAME = 2; // black margin around white outlines of overlapping events
const TIMELINE_GAP = 8;
const TICK = 4;
const TIMELINE_MARGIN = 1; // hours before the first event and after the last
const TIMELINE_EMPTY = [7, 22]; // hour range when today has no timed events
const timelineLabelW = (hour12: boolean) => (hour12 ? 24 : 16);
const timelineW = (hour12: boolean) => timelineLabelW(hour12) + TICK + 2 + TIMELINE_BARS;

export const calendarPlugin: Plugin<CalendarOptions, CalData> = {
  id: "calendar",

  async load(options, ctx) {
    // From midnight so the timeline also gets today's earlier events.
    const rangeStart = parseInZone(`${dayKeyOf(ctx.now, ctx.timeZone)}T00:00`, ctx.timeZone);
    const rangeEnd = new Date(ctx.now.getTime() + (options.daysAhead + 1) * 86_400_000);
    const events = ctx.demo || options.icsUrls.length === 0
      ? demoEvents(ctx)
      : await loadEvents(options.icsUrls, rangeStart, rangeEnd, options.hideDeclined, options.ownerEmail);
    const hidden = (title: string) =>
      options.hideTitles?.some((p) => (typeof p === "string" ? title.toLowerCase().includes(p.toLowerCase()) : p.test(title)));
    const shown = events.filter((e) => !hidden(e.title));
    const dayStart = rangeStart;
    const dayEnd = parseInZone(`${addDays(dayKeyOf(ctx.now, ctx.timeZone), 1)}T00:00`, ctx.timeZone);
    return {
      days: groupByDay(shown, ctx, options.daysAhead),
      today: shown
        .filter((e) => !e.allDay && e.end > dayStart && e.start < dayEnd)
        .map((e) => ({ start: e.start, end: e.end })),
    };
  },

  render({ data: { days, today }, options, size, ctx }) {
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

    const innerH = size.height - PAD * 2;
    const listW = size.width - PAD * 2 - (options.timeline ? timelineW(options.hour12) + TIMELINE_GAP : 0);
    return (
      <div style={{ display: "flex", width: size.width - PAD * 2, height: innerH, padding: PAD }}>
        <div style={{ display: "flex", flexDirection: "column", width: listW, height: innerH }}>
          {items.slice(0, n).map((it, i) =>
            it.type === "header" ? (
              <DayHeader key={i} dayKey={it.key} ctx={ctx} />
            ) : it.type === "empty" ? (
              <div key={i} style={{ display: "flex", height: ALLDAY_ROW - GAP, marginBottom: GAP, alignItems: "center", fontSize: 20, marginLeft: 4 }}>
                Nothing else today
              </div>
            ) : it.row.kind === "allday" ? (
              <AllDayRow key={i} row={it.row} timeCol={timeCol} />
            ) : (
              <TimedRow key={i} row={it.row} fmt={fmt} ctx={ctx} timeCol={timeCol} />
            ),
          )}
        </div>
        {options.timeline && (
          <Timeline events={today} hour12={options.hour12} height={innerH} ctx={ctx} />
        )}
      </div>
    );
  },
};

/** Today on a vertical hour axis: sparse hour labels and ticks on the left, events as bars, a line at now. */
function Timeline({ events, hour12, height, ctx }: {
  events: CalData["today"];
  hour12: boolean;
  height: number;
  ctx: RenderContext;
}) {
  const today = dayKeyOf(ctx.now, ctx.timeZone);
  const at = (h: number) => (h >= 24 ? parseInZone(`${addDays(today, 1)}T00:00`, ctx.timeZone) : parseInZone(`${today}T${String(h).padStart(2, "0")}:00`, ctx.timeZone));
  const hourOf = (d: Date) => {
    const [h, m] = d.toLocaleTimeString("en-GB", { timeZone: ctx.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
    return dayKeyOf(d, ctx.timeZone) < today ? 0 : dayKeyOf(d, ctx.timeZone) > today ? 24 : h + m / 60;
  };
  // Whole hours from the first event to the last, plus a margin, within today.
  let [from, to] = TIMELINE_EMPTY;
  if (events.length) {
    from = Math.max(0, Math.floor(Math.min(...events.map((e) => hourOf(e.start)))) - TIMELINE_MARGIN);
    to = Math.min(24, Math.ceil(Math.max(...events.map((e) => hourOf(e.end)))) + TIMELINE_MARGIN);
  }
  // Short days get denser labels.
  const labelEvery = to - from <= 8 ? 1 : to - from <= 14 ? 2 : 3;
  const t0 = at(from).getTime();
  const t1 = at(to).getTime();
  const y = (d: Date) => Math.round(((Math.min(Math.max(d.getTime(), t0), t1) - t0) / (t1 - t0)) * height);

  // Group overlapping events into clusters, with side-by-side lanes inside each.
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  type Bar = { start: Date; end: Date; lane: number };
  const clusters: { start: Date; end: Date; bars: Bar[]; lanes: number }[] = [];
  for (const e of sorted) {
    let c = clusters.at(-1);
    if (!c || e.start >= c.end) {
      c = { start: e.start, end: e.end, bars: [], lanes: 1 };
      clusters.push(c);
    }
    const laneEnds = new Map<number, number>();
    for (const b of c.bars) laneEnds.set(b.lane, Math.max(laneEnds.get(b.lane) ?? 0, b.end.getTime()));
    let lane = 0;
    while ((laneEnds.get(lane) ?? 0) > e.start.getTime()) lane++;
    c.bars.push({ ...e, lane });
    c.lanes = Math.max(c.lanes, lane + 1);
    if (e.end > c.end) c.end = e.end;
  }

  const labelW = timelineLabelW(hour12);
  const width = timelineW(hour12);
  const barX = labelW + TICK + 2;
  const barW = TIMELINE_BARS;
  const nowY = y(ctx.now);
  const showNow = ctx.now.getTime() >= t0 && ctx.now.getTime() <= t1;
  // Light grey over the part of a box (at `top`, `height` tall) that's already happened.
  const Elapsed = ({ top, height }: { top: number; height: number }) => {
    const h = Math.min(Math.max(nowY - top, 0), height);
    return h > 0 ? <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: h, background: "#999" }} /> : null;
  };
  const label = (h: number) => (hour12 ? `${h % 12 || 12}${h % 24 < 12 ? "a" : "p"}` : String(h % 24));
  return (
    <div style={{ display: "flex", position: "relative", width, height, marginLeft: TIMELINE_GAP }}>
      {Array.from({ length: to - from + 1 }, (_, i) => {
        const h = from + i;
        const top = Math.min(y(at(h)), height - 2);
        const labeled = h % labelEvery === 0 && h > from && h < to;
        return (
          <div key={`t${h}`} style={{ display: "flex" }}>
            <div style={{ position: "absolute", left: labelW, top, width: TICK, height: 2, background: "black" }} />
            {labeled && (
              <>
                {/* Faint gridline through the bars so positions read against the label. */}
                <div style={{ position: "absolute", left: barX, top, width: barW, height: 1, background: "#aaa" }} />
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    left: 0,
                    top: top - 7,
                    width: labelW - 1,
                    height: 16,
                    justifyContent: "flex-end",
                    alignItems: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {label(h)}
                </div>
              </>
            )}
          </div>
        );
      })}
      {clusters.map((c, i) => {
        const startY = y(c.start);
        const endY = y(c.end) - BAR_GAP;
        if (c.bars.length === 1) {
          const height = Math.max(3, endY - startY);
          return (
            <div
              key={`e${i}`}
              style={{ display: "flex", position: "absolute", left: barX, top: startY, width: barW, height, background: "black" }}
            >
              <Elapsed top={startY} height={height} />
            </div>
          );
        }
        // Overlaps: one box over the whole period, with each event outlined in white inside it.
        // The box has a FRAME-px margin on every side so each outline is surrounded by black
        // (an outline touching the white background would vanish). The outlines sit at the
        // exact times; only the frame pokes out past them.
        const laneW = Math.floor((barW - FRAME * 2 - FRAME * (c.lanes - 1)) / c.lanes);
        return (
          <div
            key={`e${i}`}
            style={{
              display: "flex",
              position: "absolute",
              left: barX,
              top: startY - FRAME,
              width: barW,
              height: endY - startY + FRAME * 2,
              // Dark grey to match the overlap time boxes in the list.
              background: "#404040",
            }}
          >
            <Elapsed top={startY - FRAME} height={endY - startY + FRAME * 2} />
            {c.bars.map((b, j) => {
              const top = y(b.start);
              const left = FRAME + b.lane * (laneW + FRAME);
              const height = Math.max(1, y(b.end) - BAR_GAP - top - 2);
              return (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    position: "absolute",
                    left,
                    top: top - startY + FRAME,
                    // Borders are content-box, hence the -2s. The last lane takes the rounding slack.
                    width: (b.lane === c.lanes - 1 ? barW - FRAME - left : laneW) - 2,
                    height,
                    border: "1px solid white",
                    background: "black",
                  }}
                >
                  {/* Inside the 1px border. */}
                  <Elapsed top={top + 1} height={height} />
                </div>
              );
            })}
          </div>
        );
      })}
      {showNow && <div style={{ position: "absolute", left: labelW, top: Math.min(Math.max(nowY - 2, 0), height - 4), width: width - labelW, height: 4, background: "black" }} />}
    </div>
  );
}

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
  const inv = row.ongoing || row.overlapsEarlier;
  return (
    <div style={{ display: "flex", height: TIMED_ROW - GAP, marginBottom: GAP }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: timeCol - (inv ? 0 : 4),
          flexShrink: 0,
          // Happening now is black; overlapping an earlier event is dark grey (now wins if both).
          background: row.ongoing ? "black" : inv ? "#404040" : "white",
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
    let latestEnd = 0;
    for (const row of day.rows) {
      if (row.kind !== "timed") continue;
      row.overlapsEarlier = row.start!.getTime() < latestEnd;
      latestEnd = Math.max(latestEnd, row.end!.getTime());
    }
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
