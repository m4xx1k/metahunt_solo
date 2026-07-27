import { Client } from "pg";

import type { NodeType } from "@metahunt/database";

import { cleanDescription } from "../02-enrich/dedup/sanitize";
import { joinNamesByType } from "../platform/shared/node-names";

import type { FeatureRow } from "./sampling";
import type { Extraction } from "./types";

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Cyrillic share and keyword hits are computed server-side so sampling moves
// kilobytes instead of the corpus's ~35 MB of descriptions.
const FEATURE_SQL = `
  select
    r.id::text                                                        as id,
    s.code                                                            as source,
    coalesce(nullif(btrim(r.category, ' ,'), ''), '(none)')           as category,
    r.title                                                           as title,
    r.link                                                            as link,
    r.published_at                                                    as published_at,
    length(b.body)                                                    as len,
    round(
      100.0 * length(regexp_replace(b.body, '[^\\u0400-\\u04FF]', '', 'g'))
      / greatest(length(b.body), 1)
    )                                                                 as cyr_pct,
    (b.body ~* '(\\$|USD|EUR|грн|zł|salary|зарплат|вилка)')            as has_salary_text,
    (b.body ~* '(бронь|бронюв|reservation)')                          as mentions_reservation,
    (b.body ~* '(тестове|тестовое|test task|test assignment|take[- ]home)')
                                                                      as test_assignment_hint,
    (r.title ~* '\\y(junior|middle|senior|sr|lead|principal|architect|head of|intern|trainee)\\y')
                                                                      as seniority_in_title,
    r.extracted_data                                                  as prod
  from rss_records r
  join sources s on s.id = r.source_id
  -- Approximates cleanDescription: strip tags, apply its 6000-char cap. Without this
  -- the length buckets stratify on markup verbosity, and the top bucket is 45%
  -- postings the extractor only ever sees clipped to an identical 6000 chars.
  cross join lateral (
    select left(regexp_replace(r.description, '<[^>]*>', ' ', 'g'), 6000) as body
  ) b
  where r.description is not null
    and length(btrim(r.description)) > 0
    -- 6 rows corpus-wide the pipeline never reached: no prod value to compare a
    -- golden label against, so they add absence of data rather than diversity.
    and r.extracted_data is not null
`;

type FeatureDbRow = {
  id: string;
  source: string;
  category: string;
  title: string;
  link: string | null;
  published_at: Date;
  len: number;
  cyr_pct: string;
  has_salary_text: boolean;
  mentions_reservation: boolean;
  test_assignment_hint: boolean;
  seniority_in_title: boolean;
  prod: Extraction | null;
};

export async function loadFeatures(client: Client): Promise<FeatureRow[]> {
  const { rows } = await client.query<FeatureDbRow>(FEATURE_SQL);
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    category: r.category,
    title: r.title,
    link: r.link,
    publishedAt: r.published_at.toISOString(),
    len: r.len,
    cyrPct: Number(r.cyr_pct),
    hasSalaryText: r.has_salary_text,
    mentionsReservation: r.mentions_reservation,
    testAssignmentHint: r.test_assignment_hint,
    seniorityInTitle: r.seniority_in_title,
    prod: r.prod,
  }));
}

// Byte-identical to what RssExtractActivity feeds the prompt — same title prefix,
// same sanitizer. Anything else grades the harness on text production never sees.
export async function loadTexts(client: Client, ids: string[]): Promise<Map<string, string>> {
  const { rows } = await client.query<{ id: string; title: string; description: string }>(
    `select id::text as id, title, description from rss_records where id = any($1::uuid[])`,
    [ids],
  );
  return new Map(
    rows.map((r) => [r.id, `Title: ${r.title}\n\n${cleanDescription(r.description)}`]),
  );
}

export async function loadTaxonomy(client: Client): Promise<{
  roles: string;
  domains: string;
  skills: string;
}> {
  const { rows } = await client.query<{ type: NodeType; name: string }>(
    `select type, canonical_name as name from nodes where status = 'VERIFIED'`,
  );
  return {
    roles: joinNamesByType(rows, "ROLE"),
    domains: joinNamesByType(rows, "DOMAIN"),
    skills: joinNamesByType(rows, "SKILL"),
  };
}

// `TYPE:lowercased-alias` → canonical name. Keyed by type because "Android" is both
// a skill and a role, and collapsing them would let a wrong role score as correct.
export async function loadAliases(client: Client): Promise<Record<string, string>> {
  const { rows } = await client.query<{ type: string; name: string; canonical: string }>(
    `select a.type as type, a.name as name, n.canonical_name as canonical
     from node_aliases a join nodes n on n.id = a.node_id`,
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[`${r.type}:${r.name.toLowerCase().trim()}`] = r.canonical;
  return map;
}
