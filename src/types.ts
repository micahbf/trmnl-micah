import type { ReactElement } from "react";

export interface RenderContext {
  /** "Now" for this render. Overridable from the preview (?now=...) for testing. */
  now: Date;
  /** IANA zone all dates are displayed in, e.g. "America/Chicago". */
  timeZone: string;
  /** Use built-in sample data instead of hitting real sources. */
  demo: boolean;
}

export interface SlotSize {
  width: number;
  height: number;
}

/**
 * A sub-plugin. `load` fetches whatever data it needs (may be async / network),
 * `render` turns it into Satori-compatible JSX sized to exactly `size`.
 */
export interface Plugin<Options = unknown, Data = unknown> {
  id: string;
  load(options: Options, ctx: RenderContext): Promise<Data>;
  render(props: { data: Data; options: Options; size: SlotSize; ctx: RenderContext }): ReactElement;
  /**
   * In a stack, how tall this plugin wants to be for `data` (0 hides it). Plugins
   * without it share whatever height is left.
   */
  height?(props: { data: Data; options: Options; width: number }): number;
}

export interface PluginSlot {
  plugin: string;
  options?: unknown;
  /** Share of the row width (flex-grow style). Defaults to 1. */
  weight?: number;
}

/** Plugins stacked top → bottom in one column, with a divider between them. */
export interface StackSlot {
  stack: Omit<PluginSlot, "weight">[];
  weight?: number;
}

export type Slot = PluginSlot | StackSlot;

export interface ScreenConfig {
  width: number;
  height: number;
  timeZone: string;
  /**
   * 1 = black/white. 2 = four shades (TRMNL OG firmware 1.6.0+), which keeps
   * anti-aliased text edges and reads noticeably smoother.
   */
  bitDepth: 1 | 2;
  /** Slots laid out left → right with a divider between them. */
  slots: Slot[];
}
