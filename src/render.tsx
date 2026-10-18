import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { Plugin, RenderContext, ScreenConfig } from "./types.js";
import { encodeGreyPng } from "./png.js";
import { loadAdditionalAsset } from "./glyphs.js";
import { calendarPlugin } from "./plugins/calendar/index.js";
import { datePlugin } from "./plugins/date/index.js";

const plugins: Record<string, Plugin<any, any>> = {
  [calendarPlugin.id]: calendarPlugin,
  [datePlugin.id]: datePlugin,
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
      const plugin = plugins[slot.plugin];
      if (!plugin) throw new Error(`Unknown plugin "${slot.plugin}"`);
      const isLast = i === slots.length - 1;
      // Give the last slot the rounding remainder so widths sum exactly.
      const slotWidth = isLast
        ? usable - slots.slice(0, -1).reduce((w, s) => w + Math.floor((usable * (s.weight ?? 1)) / totalWeight), 0)
        : Math.floor((usable * (slot.weight ?? 1)) / totalWeight);
      const size = { width: slotWidth, height };
      let content;
      try {
        const data = await plugin.load(slot.options, ctx);
        content = plugin.render({ data, options: slot.options, size, ctx });
      } catch (err) {
        console.error(`[${slot.plugin}]`, err);
        content = <ErrorPanel name={slot.plugin} message={(err as Error).message} />;
      }
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

function ErrorPanel({ name, message }: { name: string; message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 20, gap: 8 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{name}: error</div>
      <div style={{ fontSize: 16 }}>{message.slice(0, 300)}</div>
    </div>
  );
}
