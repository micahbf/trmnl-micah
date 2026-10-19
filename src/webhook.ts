import { createHash } from "node:crypto";
import { config } from "./config.js";
import { renderScreen } from "./render.js";

// TRMNL's Webhook Image plugin allows 12 uploads per hour, so every 5 minutes is the max.
const INTERVAL_MS = 5 * 60 * 1000;

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
  });
  if (!res.ok) throw new Error(`webhook: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  lastHash = hash;
  console.log(`webhook: pushed ${png.length} bytes`);
}

export function startWebhook(url: string) {
  const tick = () => push(url).catch((err) => console.error(err));
  tick();
  setInterval(tick, INTERVAL_MS);
}
