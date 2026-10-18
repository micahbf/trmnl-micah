import type { Plugin } from "../../types.js";

/** Big, glanceable date. Mostly here as a second example sub-plugin. */
export const datePlugin: Plugin<undefined, null> = {
  id: "date",

  async load() {
    return null;
  },

  render({ size, ctx }) {
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
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2 }}>
          {opt({ weekday: "long" })}
        </div>
        <div style={{ display: "flex", fontSize: 200, fontWeight: 800, lineHeight: 1, letterSpacing: -8 }}>
          {opt({ day: "numeric" })}
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600 }}>{opt({ month: "long", year: "numeric" })}</div>
      </div>
    );
  },
};
