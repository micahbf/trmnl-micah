export interface Task {
  content: string;
  /** API scale: 4 is what the app calls p1, 1 is p4. */
  priority: number;
  /** "YYYY-MM-DD", or with a time: "YYYY-MM-DDTHH:MM:SS" (floating) or "…Z" (fixed zone). */
  due: { date: string } | null;
  child_order: number;
}

const cache = new Map<string, { at: number; tasks: Task[] }>();
const CACHE_MS = 5 * 60 * 1000;

/** Open tasks matching a Todoist filter query, e.g. "p1 | p2". */
export async function loadTasks(token: string, query: string): Promise<Task[]> {
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tasks;
  const tasks: Task[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("https://api.todoist.com/api/v1/tasks/filter");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Todoist fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as { results: Task[]; next_cursor: string | null };
    tasks.push(...body.results);
    cursor = body.next_cursor;
  } while (cursor);
  cache.set(query, { at: Date.now(), tasks });
  return tasks;
}
