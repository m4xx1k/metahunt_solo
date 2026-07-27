import { findEvent } from "./event-catalog";

// Kept as its own module because half the console imports it, but the names now
// come from the catalog — a funnel step can no longer get one label here and a
// different one in a tooltip.
export function eventLabel(name: string): string {
  return findEvent(name)?.label ?? name.replace(/_/g, " ");
}
