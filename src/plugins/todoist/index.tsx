import type { Plugin, RenderContext } from "../../types.js";
import { loadTasks, type Task } from "./api.js";
import { addDays, dayKeyOf, parseInZone } from "../calendar/dates.js";

export interface TodoistOptions {
  /** API token (Todoist → Settings → Integrations → Developer). No token shows demo tasks. */
  token: string;
}

interface Todo {
  title: string;
  /** 1 or 2, as the app shows it. */
  priority: number;
  /** Due day "YYYY-MM-DD" in the display zone. */
  dueDay?: string;
}

// Fixed heights, as in the calendar. Rows use marginBottom for spacing (Satori boxes are content-box).
const PAD = 12;
const HEADER = 40;
const ROW = 60;
const GAP = 6;
const BADGE = 52;
const DOT = 12;
// Only p1/p2 are fetched and there should be at most a couple; past this the header says "+N more".
const MAX_ROWS = 3;
// Timed tasks start showing this long before they are due.
const LEAD_MS = 60 * 60 * 1000;

const shownCount = (todos: Todo[]) => Math.min(todos.length, MAX_ROWS);

/** Top-priority (p1 and p2) open tasks, stacked under another plugin. Hidden when there are none. */
export const todoistPlugin: Plugin<TodoistOptions, Todo[]> = {
  id: "todoist",

  async load(options, ctx) {
    const todos = ctx.demo || !options.token ? demoTodos(ctx) : (await loadTasks(options.token, "p1 | p2")).flatMap((t) => toTodo(t, ctx));
    // Most urgent first: priority, then due day (undated last).
    return todos.sort((a, b) => a.priority - b.priority || (a.dueDay ?? "~").localeCompare(b.dueDay ?? "~"));
  },

  height({ data }) {
    return data.length ? PAD * 2 + HEADER + shownCount(data) * ROW - GAP : 0;
  },

  render({ data, size }) {
    const more = data.length - shownCount(data);
    return (
      <div style={{ display: "flex", flexDirection: "column", width: size.width - PAD * 2, padding: PAD }}>
        <div
          style={{
            display: "flex",
            height: HEADER - GAP,
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
          <div style={{ display: "flex" }}>Priorities</div>
          {more > 0 && <div style={{ display: "flex", fontWeight: 700 }}>{`+${more} more`}</div>}
        </div>
        {data.slice(0, MAX_ROWS).map((t, i, shown) => (
          <TodoRow key={i} todo={t} last={i === shown.length - 1} />
        ))}
      </div>
    );
  },
};

function TodoRow({ todo, last }: { todo: Todo; last: boolean }) {
  const p1 = todo.priority === 1;
  // Quantization thins white-on-black, so the white dot is drawn a bit larger to look the same size.
  const dot = p1 ? DOT + 2 : DOT;
  return (
    <div style={{ display: "flex", height: ROW - GAP, marginBottom: last ? 0 : GAP }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // p1 is solid black like an ongoing event; p2 is outlined. Borders add to the width.
          width: BADGE - (p1 ? 0 : 4),
          flexShrink: 0,
          background: p1 ? "black" : "white",
          color: p1 ? "white" : "black",
          border: p1 ? "none" : "2px solid black",
        }}
      >
        {/* p1 is one dot, p2 two. Drawn as circles: a "•" glyph sits low in its line box. */}
        {Array.from({ length: todo.priority }, (_, i) => (
          <div
            key={i}
            style={{ width: dot, height: dot, borderRadius: dot / 2, marginLeft: i ? DOT / 2 : 0, background: p1 ? "white" : "black" }}
          />
        ))}
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
        <div style={{ display: "block", lineClamp: 2 }}>{todo.title}</div>
      </div>
    </div>
  );
}

function toTodo(t: Task, ctx: RenderContext): Todo[] {
  // API priority 4 is p1, 3 is p2. The filter already asks for these; this guards against anything else.
  if (t.priority < 3) return [];
  const d = t.due?.date;
  // Not yet relevant: due on a later day, or at a time more than LEAD_MS away.
  const at = d?.includes("T") ? parseInZone(d, ctx.timeZone) : undefined;
  const dueDay = !d ? undefined : at ? dayKeyOf(at, ctx.timeZone) : d;
  if (at ? at.getTime() - ctx.now.getTime() > LEAD_MS : dueDay && dueDay > dayKeyOf(ctx.now, ctx.timeZone)) return [];
  return [{ title: plainText(t.content), priority: 5 - t.priority, dueDay }];
}

/** Task content is Markdown; keep link text and drop emphasis markers. */
function plainText(md: string): string {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
    .trim();
}

function demoTodos(ctx: RenderContext): Todo[] {
  const today = dayKeyOf(ctx.now, ctx.timeZone);
  return [
    { title: "Renew passport before the Denver trip", priority: 1, dueDay: addDays(today, -1) },
    { title: "Send Q4 budget to finance", priority: 2, dueDay: today },
  ];
}
