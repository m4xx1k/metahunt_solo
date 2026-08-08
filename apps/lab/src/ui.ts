/** Shared class strings. Kept in one place so the three views cannot drift into
 *  three slightly different tables. */

export const panel = "border border-rule rounded-lg bg-panel overflow-hidden";

export const panelHead =
  "px-4 py-3 border-b border-rule flex flex-wrap gap-x-4 gap-y-2 items-baseline justify-between";

export const panelTitle = "text-sm font-semibold";
export const panelNote = "text-xs text-ink-3";

export const label =
  "font-mono text-[0.66rem] tracking-[0.1em] uppercase text-ink-3";

export const input =
  "bg-panel border border-rule-strong rounded px-2 py-1 text-sm min-w-44";

const thBase =
  "font-mono text-[0.65rem] tracking-wider uppercase text-ink-3 font-medium px-3.5 py-1.5 whitespace-nowrap";

export const th = `${thBase} text-right`;
/** Alignment lives in the class, not layered on top of it: two Tailwind
 *  alignment utilities on one element resolve by stylesheet order, not by the
 *  order they are written. */
export const thLeft = `${thBase} text-left`;

export const td = "font-mono px-3.5 py-1.5 text-right whitespace-nowrap";

export const tdName = "font-sans px-3.5 py-1.5 text-left";

export const tab = (active: boolean) =>
  [
    "rounded-full border px-3.5 py-1 text-[0.82rem] cursor-pointer transition-colors",
    active
      ? "bg-signal border-signal text-ground"
      : "bg-transparent border-rule-strong text-ink-2 hover:border-signal hover:text-ink",
  ].join(" ");
