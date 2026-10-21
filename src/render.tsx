import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { Plugin, PluginSlot, RenderContext, ScreenConfig, SlotSize } from "./types.js";
import { encodeGreyPng } from "./png.js";
import { loadAdditionalAsset } from "./glyphs.js";
import { calendarPlugin } from "./plugins/calendar/index.js";
import { datePlugin } from "./plugins/date/index.js";
import { todoistPlugin } from "./plugins/todoist/index.js";

const plugins: Record<string, Plugin<any, any>> = {
  [calendarPlugin.id]: calendarPlugin,
  [datePlugin.id]: datePlugin,
  [todoistPlugin.id]: todoistPlugin,
};

const require = createRequire(import.meta.url);
const fontDir = (pkg: string) => `${dirname(require.resolve(`${pkg}/package.json`))}/files`;

// Inter (Latin + Latin Extended). Emoji and symbols come from glyphs.ts.
const interDir = fontDir("@fontsource/inter");
const fonts = [
  ...([400, 600, 700, 800] as const).flatMap((weight) =>
    ["latin", "latin-ext"].map((subset) => ({
      name: "Inter",
      weight,
      style: "normal" as const,
      data: readFileSync(`${interDir}/inter-${subset}-${weight}-normal.woff`),
    })),
  ),
];

const DIVIDER = 3;

export async function renderScreen(config: ScreenConfig, ctx: RenderContext): Promise<Buffer> {
  const { width, height, slots } = config;
  const totalWeight = slots.reduce((sum, s) => sum + (s.weight ?? 1), 0);
  const usable = width - DIVIDER * (slots.length - 1);

  const children = await Promise.all(
    slots.map(async (slot, i) => {
      const isLast = i === slots.length - 1;
      // Give the last slot the rounding remainder so widths sum exactly.
      const slotWidth = isLast
        ? usable - slots.slice(0, -1).reduce((w, s) => w + Math.floor((usable * (s.weight ?? 1)) / totalWeight), 0)
        : Math.floor((usable * (slot.weight ?? 1)) / totalWeight);
      const content = "stack" in slot
        ? await renderStack(slot.stack, { width: slotWidth, height }, ctx)
        : await renderPlugin(slot, { width: slotWidth, height }, ctx);
      return (
        <div key={i} style={{ display: "flex", width: slotWidth, height, overflow: "hidden" }}>
          {content}
        </div>
      );
    }),
  );

  const withDividers = children.flatMap((child, i) =>
    i === 0 ? [child] : [<div key={`d${i}`} style={{ width: DIVIDER, height, background: "black" }} />, child],
  );

  const svg = await satori(
    <div style={{ display: "flex", width, height, background: "white", color: "black", fontFamily: "Inter" }}>
      {withDividers}
    </div>,
    { width, height, fonts, loadAdditionalAsset },
  );

  const image = new Resvg(svg, { fitTo: { mode: "original" } }).render();
  return encodeGreyPng(image.pixels, image.width, image.height, config.bitDepth);
}

type Loaded = { slot: Omit<PluginSlot, "weight">; plugin: Plugin<any, any>; data?: unknown; error?: Error };

async function load(slot: Omit<PluginSlot, "weight">, ctx: RenderContext): Promise<Loaded> {
  const plugin = plugins[slot.plugin];
  if (!plugin) throw new Error(`Unknown plugin "${slot.plugin}"`);
  try {
    return { slot, plugin, data: await plugin.load(slot.options, ctx) };
  } catch (err) {
    console.error(`[${slot.plugin}]`, err);
    return { slot, plugin, error: err as Error };
  }
}

function draw({ slot, plugin, data, error }: Loaded, size: SlotSize, ctx: RenderContext) {
  if (!error) {
    try {
      return plugin.render({ data, options: slot.options, size, ctx });
    } catch (err) {
      console.error(`[${slot.plugin}]`, err);
      error = err as Error;
    }
  }
  return <ErrorPanel name={slot.plugin} message={error.message} />;
}

async function renderPlugin(slot: Omit<PluginSlot, "weight">, size: SlotSize, ctx: RenderContext) {
  return draw(await load(slot, ctx), size, ctx);
}

const ERROR_HEIGHT = 100;

/** Plugins with `height()` get what they ask for; the rest split what's left evenly. Zero-height ones are dropped. */
async function renderStack(stack: Omit<PluginSlot, "weight">[], size: SlotSize, ctx: RenderContext) {
  const loaded = await Promise.all(stack.map((s) => load(s, ctx)));
  const asked = loaded.map((l) =>
    l.error ? ERROR_HEIGHT : l.plugin.height?.({ data: l.data, options: l.slot.options, width: size.width }),
  );
  const shown = loaded.map((l, i) => ({ l, h: asked[i] })).filter((x) => x.h !== 0);
  const fixed = shown.reduce((sum, x) => sum + (x.h ?? 0), 0);
  const flexible = shown.filter((x) => x.h === undefined);
  const spare = size.height - fixed - DIVIDER * (shown.length - 1);
  let flexLeft = spare;
  const heights = shown.map((x) => {
    if (x.h !== undefined) return x.h;
    const isLastFlex = x === flexible.at(-1);
    const h = isLastFlex ? flexLeft : Math.floor(spare / flexible.length);
    flexLeft -= h;
    return h;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", width: size.width, height: size.height }}>
      {shown.flatMap((x, i) => {
        const box = (
          <div key={i} style={{ display: "flex", width: size.width, height: heights[i], overflow: "hidden" }}>
            {draw(x.l, { width: size.width, height: heights[i] }, ctx)}
          </div>
        );
        return i === 0 ? [box] : [<div key={`d${i}`} style={{ width: size.width, height: DIVIDER, background: "black" }} />, box];
      })}
    </div>
  );
}

function ErrorPanel({ name, message }: { name: string; message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 20, gap: 8 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{name}: error</div>
      <div style={{ fontSize: 16 }}>{message.slice(0, 300)}</div>
    </div>
  );
}
