import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import opentype from "opentype.js";

// Satori doesn't fall back to regular fonts for emoji/symbol characters. It
// asks `loadAdditionalAsset` for them instead. We answer with an SVG of the
// glyph from a monochrome fallback font, which suits e-paper far better than
// color emoji images.

const require = createRequire(import.meta.url);
const load = (file: string) => {
  const buf = readFileSync(require.resolve(file));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
};

// Order matters: first font with the glyph wins.
const fallbacks = [
  load("@fontsource/noto-emoji/files/noto-emoji-emoji-700-normal.woff"),
  load("@fontsource/noto-sans-math/files/noto-sans-math-latin-400-normal.woff"),
];

const cache = new Map<string, string | undefined>();

export async function loadAdditionalAsset(_code: string, segment: string): Promise<string | []> {
  if (!cache.has(segment)) cache.set(segment, glyphSvg(segment));
  return cache.get(segment) ?? [];
}

function glyphSvg(segment: string): string | undefined {
  // Drop variation selectors / ZWJ. For ZWJ sequences this renders the first
  // component, which is a reasonable approximation in monochrome.
  const char = [...segment].find((c) => !/[︎️‍]/.test(c));
  if (!char) return undefined;
  for (const font of fallbacks) {
    const glyph = font.charToGlyph(char);
    if (!glyph || glyph.index === 0) continue;
    const em = font.unitsPerEm;
    const ascender = font.ascender;
    const height = ascender - font.descender;
    const width = glyph.advanceWidth ?? em;
    const d = glyph.getPath(0, ascender, em).toPathData(2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${d}" fill="black"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
  return undefined;
}
