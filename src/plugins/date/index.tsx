import type { Plugin } from "../../types.js";

/** Big, glanceable date. Mostly here as a second example sub-plugin. */
export const datePlugin: Plugin<undefined, null> = {
  id: "date",

  async load() {
    return null;
  },

  render({ size, ctx }) {
    // Full size fills a whole column; shrink when stacked above something.
    const k = Math.min(1, size.height / 340);
    const opt = (o: Intl.DateTimeFormatOptions) => ctx.now.toLocaleDateString("en-US", { timeZone: ctx.timeZone, ...o });
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: size.width,
          height: size.height,
        }}
      >
        <div style={{ display: "flex", fontSize: Math.round(40 * k), fontWeight: 800, textTransform: "uppercase", letterSpacing: 2 * k }}>
          {opt({ weekday: "long" })}
        </div>
        <div style={{ display: "flex", fontSize: Math.round(200 * k), fontWeight: 800, lineHeight: 1, letterSpacing: -8 * k }}>
          {opt({ day: "numeric" })}
        </div>
        <div style={{ display: "flex", fontSize: Math.round(40 * k), fontWeight: 600 }}>{opt({ month: "long", year: "numeric" })}</div>
      </div>
    );
  },
};
