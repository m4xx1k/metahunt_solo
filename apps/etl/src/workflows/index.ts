// Barrel that aggregates every feature module's workflows into one
// directory the Temporal worker can bundle. Each new feature adds a
// re-export here; the worker's workflowsPath stays put.
export * from "../01-ingest/rss/workflows";
export * from "../02-enrich/loader/workflows";
export * from "../02-enrich/dedup/workflows";
export * from "../04-notify/telegram/workflows";
