# trmnl-micah

One "meta plugin" for a TRMNL OG (800×480). It composes sub-plugins into a single
**greyscale PNG** (2-bit / 4 shades by default, 1-bit optional) and serves it over HTTP. TRMNL shows that PNG full-screen, so none of
TRMNL's Framework/markup is involved.

```
Google Calendar (ICS) ─┐
other sources …       ─┼─▶ sub-plugins (JSX) ─▶ Satori → SVG ─▶ resvg → pixels ─▶ 2-bit (4-shade) greyscale PNG
                       ┘                                                       │
                                                       GET /screen.png ◀── TRMNL (Alias plugin)
```

## Quick start

```sh
npm install
cp .env.example .env      # paste your calendar's secret iCal URL
npm run dev               # → http://localhost:3000
```

The preview page shows the exact 1-bit image the device gets. It re-renders when
you save any file under `src/`. It also has toggles for demo data, 2× zoom, and a
"pretend now" time picker.

To render once to `out/screen.png`, run `npm run render` (add `-- --demo` to use sample data).

### Getting the Google Calendar URL

Google Calendar → ⚙ Settings → pick the calendar under "Settings for my calendars" →
**Integrate calendar** → **Secret address in iCal format**. Put it in `GCAL_ICS_URLS`
(comma-separate multiple calendars). Events you've declined are hidden. Your address is read from the feed, since Google names
primary calendars after their owner. For other calendars, set `GCAL_EMAIL`.

To hide events by title, add entries to `hideTitles` in `src/config.ts`. Strings match
anywhere in the title, ignoring case, and regexes work too, e.g. `["Focus time", /^Hold:/]`.

With no URL configured, the calendar shows demo data.

## Layout & sub-plugins

`src/config.ts` defines the screen as a row of slots, separated by a divider:

```ts
slots: [
  { plugin: "calendar", options: calendar },   // left half
  { plugin: "date" },                          // right half
]
```

`weight` changes the width split, e.g. `{ plugin: "calendar", weight: 2 }` for ⅔ width.

To add a sub-plugin, create `src/plugins/<name>/index.tsx` exporting a `Plugin`
(`load()` fetches data, `render()` returns JSX for exactly `size.width × size.height`),
then register it in `src/render.tsx`.

Satori gotchas:
- Every `<div>` with more than one child needs `display: "flex"`.
- Only flexbox layout is supported (no grid).
- Boxes are **content-box**: padding and borders add to `width`/`height`.
- Text is anti-aliased and then snapped to 4 shades (or 2 with `bitDepth: 1`).
  Keep text ≥ ~14px, and use weights 600+ for small or white-on-black text.
- Emoji and symbols Inter lacks (→, ✈, …) are drawn from monochrome Noto Emoji /
  Noto Sans Math glyphs (`src/glyphs.ts`). They are always black, so avoid them in
  white-on-black text.

## Hooking it up to TRMNL

The server must be reachable from the internet. Then in TRMNL, add the **Alias**
plugin, point it at `https://<your-host>/screen.png?key=<SCREEN_KEY>`, and make it the
only item in your playlist.

The output is already 800×480 greyscale, which is what Alias expects. 2-bit (4-shade)
images need device firmware 1.6.0+; set `bitDepth: 1` in config if yours shows garbage. The endpoint sends
`ETag` / `Last-Modified` headers, so TRMNL only redraws when the image actually changes.
**Image Display** also works, but it rescales the image.

Set `SCREEN_KEY` before exposing the server, because the image contains your calendar.
