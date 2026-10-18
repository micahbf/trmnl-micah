import "./env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "./config.js";
import { renderScreen } from "./render.js";
import { parseInZone } from "./plugins/calendar/dates.js";

// Usage: npm run render [-- --demo] [-- --now 2026-10-17T09:30]   (--now is in the display zone)
const args = process.argv.slice(2);
const nowArg = args[args.indexOf("--now") + 1];
const png = await renderScreen(config, {
  now: args.includes("--now") ? parseInZone(nowArg, config.timeZone) : new Date(),
  timeZone: config.timeZone,
  demo: args.includes("--demo"),
});
mkdirSync("out", { recursive: true });
writeFileSync("out/screen.png", png);
console.log(`wrote out/screen.png (${png.length} bytes)`);
