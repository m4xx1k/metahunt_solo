-- Coverage lookup needs to answer "we saw this in RSS but never created a
-- vacancy" — a loader bug, not a feed gap. That probe is keyed on
-- (source_id, external_id), which until now had no index of its own:
-- `rss_records_source_id_idx` alone degrades to a filter over the whole source.
CREATE INDEX IF NOT EXISTS "rss_records_source_external_idx" ON "rss_records" ("source_id","external_id");
