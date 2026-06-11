-- Make node_aliases keys separator-insensitive: strip spaces / - / _ / . / /
-- in addition to the lowercasing from 0018, so "REST Assured", "rest-assured"
-- and "RestAssured" resolve to one node instead of spawning variant nodes.
-- Mirrors normalizeAliasName() in apps/etl/src/platform/shared/normalize-alias.ts.
-- Data-only fix (no schema change → no snapshot, same as 0018).
-- See feat/taxonomy-autoverify.

-- 1) Drop aliases that would collide on (type, normalized name). Keep one row
--    per key: prefer the alias whose node is VERIFIED (future extractions
--    should land on the curated node), then NEW over HIDDEN, then the earliest
--    created.
DELETE FROM node_aliases
WHERE id IN (
  SELECT id FROM (
    SELECT a.id,
           row_number() OVER (
             PARTITION BY a.type, regexp_replace(lower(a.name), '[\s_./-]+', '', 'g')
             ORDER BY (n.status = 'VERIFIED') DESC,
                      (n.status = 'NEW') DESC,
                      a.created_at ASC, a.id ASC
           ) AS rn
    FROM node_aliases a
    JOIN nodes n ON n.id = a.node_id
  ) ranked
  WHERE rn > 1
);
--> statement-breakpoint

-- 2) Normalize the survivors.
UPDATE node_aliases
SET name = regexp_replace(lower(name), '[\s_./-]+', '', 'g')
WHERE name <> regexp_replace(lower(name), '[\s_./-]+', '', 'g');
--> statement-breakpoint

-- 3) Re-assert the "normalize(canonical) is always an alias" invariant under
--    the new normalization. ON CONFLICT skips when the key already points
--    elsewhere — a pre-existing collision between two nodes' canonicals,
--    which needs a manual merge.
INSERT INTO node_aliases (name, type, node_id)
SELECT regexp_replace(lower(canonical_name), '[\s_./-]+', '', 'g'), type, id
FROM nodes
ON CONFLICT (name, type) DO NOTHING;
