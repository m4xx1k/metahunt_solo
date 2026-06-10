-- Normalize node_aliases to lowercase and enforce the "lower(canonical) is
-- always an alias" invariant that ingest relies on. Historically merge/rename
-- inserted the original-case canonical as an alias; because ingest resolves
-- aliases by exact lower-cased match, those mixed-case rows never resolved and
-- could spawn duplicate nodes. Data-only fix (no schema change → no snapshot,
-- same as 0008/0009). See feat/taxonomy-merge-hardening.

-- 1) Drop case-duplicate aliases that would collide on (type, lower(name))
--    after normalization. Keep one row per (type, lower(name)): prefer a row
--    already stored lowercase, then the earliest created.
DELETE FROM node_aliases
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY type, lower(name)
             ORDER BY (name = lower(name)) DESC, created_at ASC, id ASC
           ) AS rn
    FROM node_aliases
  ) ranked
  WHERE rn > 1
);
--> statement-breakpoint

-- 2) Lowercase the survivors.
UPDATE node_aliases SET name = lower(name) WHERE name <> lower(name);
--> statement-breakpoint

-- 3) Backfill lower(canonical_name) as a self-alias for every node so any
--    differently-cased re-extraction resolves here instead of creating a dup.
--    ON CONFLICT skips when that name already points elsewhere — a pre-existing
--    case-collision between two nodes' canonicals, which needs a manual merge.
INSERT INTO node_aliases (name, type, node_id)
SELECT lower(canonical_name), type, id FROM nodes
ON CONFLICT (name, type) DO NOTHING;
