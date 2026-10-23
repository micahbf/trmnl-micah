import { createHash } from "node:crypto";
import { config } from "./config.js";
import { renderScreen } from "./render.js";

// TRMNL's Webhook Image plugin allows 12 uploads per hour over a rolling window,
// and rejected uploads seem to count too. Exactly every 5 minutes hit 429s
// whenever render time varied, so leave a margin.
const INTERVAL_MS = 6 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

class RateLimited extends Error {
  constructor(readonly retryAfterMs: number | undefined) {
    super("webhook: HTTP 429");
  }
}

let lastHash = "";

async function push(url: string) {
  const png = await renderScreen(config, { now: new Date(), timeZone: config.timeZone, demo: false });
  const hash = createHash("sha1").update(png).digest("hex");
  // Unchanged images would only burn rate limit.
  if (hash === lastHash) return;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: new Uint8Array(png),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new RateLimited(retryAfter > 0 ? retryAfter * 1000 : undefined);
  }
  if (!res.ok) throw new Error(`webhook: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  lastHash = hash;
  console.log(`webhook: pushed ${png.length} bytes`);
}

export function startWebhook(url: string) {
  let backoff = INTERVAL_MS;
  // Each tick schedules the next one only after it finishes, so ticks never
  // overlap and consecutive POSTs are always at least INTERVAL_MS apart.
  const tick = async () => {
    let delay = INTERVAL_MS;
    try {
      await push(url);
      backoff = INTERVAL_MS;
    } catch (err) {
      if (err instanceof RateLimited) {
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        delay = Math.max(backoff, err.retryAfterMs ?? 0);
        console.error(`webhook: rate limited (429); next try in ${Math.round(delay / 60_000)} min`);
      } else {
        console.error(err);
      }
    }
    setTimeout(tick, delay);
  };
  tick();
}
