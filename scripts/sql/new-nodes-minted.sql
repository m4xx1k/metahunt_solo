-- How many distinct NEW SKILL nodes a re-extraction batch minted, and how
-- heavy each one is. This is R10's release gate: `node_stats` counts NEW and
-- VERIFIED alike (only HIDDEN is excluded), so anything the extractor invents
-- enters the IDF weights immediately, and a rare node carries a HIGH weight.
-- Run it after a batch and BEFORE refreshing node_stats.
--
-- Set the cutoff to the moment the batch started.
--
--   psql "$DATABASE_URL" -v since="'2026-09-20 00:00'" -f scripts/sql/new-nodes-minted.sql
--

SELECT n.canonical_name,
       count(DISTINCT vn.vacancy_id) AS postings,
       n.created_at
FROM nodes n
LEFT JOIN vacancy_nodes vn ON vn.node_id = n.id
WHERE n.type = 'SKILL'
  AND n.status = 'NEW'
  AND n.created_at >= :since::timestamptz
GROUP BY n.id, n.canonical_name, n.created_at
ORDER BY postings DESC, n.canonical_name;

-- The numbers to read: how many new names, how many are one-offs, and how many
-- look like a sentence rather than a name.
SELECT count(*)                             AS minted,
       count(*) FILTER (WHERE postings = 1) AS carried_by_one_posting,
       count(*) FILTER (WHERE words >= 4)   AS four_words_or_more
FROM (
  SELECT n.canonical_name,
         count(DISTINCT vn.vacancy_id) AS postings,
         array_length(string_to_array(btrim(n.canonical_name), ' '), 1) AS words
  FROM nodes n
  LEFT JOIN vacancy_nodes vn ON vn.node_id = n.id
  WHERE n.type = 'SKILL' AND n.status = 'NEW' AND n.created_at >= :since::timestamptz
  GROUP BY n.id, n.canonical_name
) t;
