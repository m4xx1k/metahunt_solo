// Cross-cutting wire primitives shared across the read-API modules (feed,
// tracks, market). No NestJS/Drizzle/runtime imports so the web client can
// mirror these types directly.

export interface NodeRef {
  id: string;
  /** `nodes.canonical_name` — already humanized at ingest time. */
  name: string;
}
