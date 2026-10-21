# CLAUDE.md

Renders sub-plugins to one 800×480 greyscale PNG for a TRMNL OG (served at `/screen.png`, and POSTed every 5 min to TRMNL's Webhook Image plugin when `TRMNL_WEBHOOK_URL` is set; see `webhook.ts`). See README for the overall picture.

## Commands
- `npm run dev`: preview server at http://localhost:3000, restarts on `src/` changes
- `npm run render -- --demo --now 2026-10-17T09:05`: writes `out/screen.png`. **Read that PNG to check visual changes.** `--now` is wall-clock time in the display zone; `--demo` uses sample events.
- `npm run typecheck`. There are no tests.
- Production runs via `docker compose up -d --build` (Dockerfile runs tsx at runtime; `tsx` is a prod dependency on purpose). `/healthz` skips the key check.

## Pipeline
`config.ts` slots → `plugin.load()` → `plugin.render()` JSX → Satori (SVG) → resvg (RGBA) → `png.ts` (custom 1/2-bit greyscale encoder; no sharp). Register new plugins in `render.tsx`.

## Satori gotchas (all hit before)
- Boxes are **content-box**: padding and borders add to `width`/`height`. Don't put padding inside a fixed-height row; use `marginBottom` for gaps.
- Every `<div>` with more than one child needs `display: "flex"`. Flexbox only.
- Emoji and symbols outside Inter's Latin subsets (→, ✈, …) never fall back to regular fonts. They go through `loadAdditionalAsset` in `glyphs.ts`, which draws monochrome glyphs as SVG images, always black.
- White-on-black text gets thinned by quantization, so use weight 700+ for it.

## Calendar plugin
- Data comes from secret iCal URLs (`GCAL_ICS_URLS` in `.env`), parsed with ical.js 2.x, including recurrence and exception handling (`ics.ts`). Fetches are cached in memory for 5 minutes.
- Layout uses **fixed row heights** (constants at the top of `index.tsx`), so the code knows how many rows fit before rendering. Change those constants if you change row content.
- Times are displayed in `config.timeZone` (`TZ_DISPLAY`, defaulting to the system zone). Use `dates.ts` helpers (`dayKeyOf`, `parseInZone`); don't use `Date` local-time methods.
- Declined events are hidden by matching the feed's `X-WR-CALNAME` (the owner's email) against attendee PARTSTAT.

## Todoist plugin
- Uses the v1 API (`GET /api/v1/tasks/filter?query=p1 | p2`, Bearer `TODOIST_TOKEN`), cached 5 minutes. API priority 4 is the app's p1 and 3 is p2.
- Stacked under `date` via `height()`, which returns 0 with no tasks so the date gets the whole column. The date scales its fonts to its height.

## Rules
- Never commit `.env` (it holds private calendar URLs, the Todoist token, and the webhook URL). The repo is public.
- Don't print or log real calendar contents beyond what's needed to debug.
