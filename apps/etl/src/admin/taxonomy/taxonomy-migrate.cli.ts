/**
 * Bulk taxonomy migration driver: replays a reviewed plan file through
 * TaxonomyService so every operation keeps the alias invariants the service
 * maintains. See md/journal/migrations/taxonomy-role-v2.md for the plan's
 * reasoning and the run sheet.
 *
 * Dry-run is the DEFAULT — nothing mutates without `--apply`.
 *
 * Usage (wrapped by the `taxonomy:migrate` npm script at repo root):
 *   pnpm taxonomy:migrate --plan apps/etl/src/admin/taxonomy/plans/<reviewed-plan>.json
 *   pnpm taxonomy:migrate --plan <path> --phase 1
 *   pnpm taxonomy:migrate --plan <path> --apply
 *
 * Exit codes: 0 clean · 1 warnings present · 2 refusals present (nothing applied).
 */

import "reflect-metadata";

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { sql } from "drizzle-orm";

import { DRIZZLE, DatabaseModule } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { validateEnv } from "../../platform/config/env.validation";

import { TaxonomyService } from "./taxonomy.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    DatabaseModule.forRoot(),
  ],
  providers: [TaxonomyService],
})
class TaxonomyMigrateCliModule {}

type NodeType = "ROLE" | "SKILL" | "DOMAIN";

type PlanOp =
  | { op: "rename"; type: NodeType; from: string; to: string; why?: string }
  | { op: "merge"; type: NodeType; from: string; into: string; why?: string }
  | { op: "hide"; type: NodeType; name: string; why?: string }
  | { op: "verify"; type: NodeType; name: string; why?: string };

type Plan = {
  name: string;
  description?: string;
  phases: { phase: number; title: string; why?: string; ops: PlanOp[] }[];
};

type Verdict = "APPLY" | "SKIP" | "REFUSE" | "WARN";

type NodeRow = { id: string; status: string; slug: string | null };

// Later phases depend on names earlier phases create (four renames mint the
// merge targets). Without projecting those forward, a whole-plan dry-run refuses
// every dependent merge and can never validate more than one phase at a time.
type Overlay = { nodes: Map<string, NodeRow | null>; aliases: Map<string, string> };

const key = (type: NodeType, name: string) => `${type}:${name}`;

type Resolved = {
  op: PlanOp;
  verdict: Verdict;
  reason: string;
  detail: string[];
  sourceId?: string;
  targetId?: string;
  /** Vacancies attached at resolve time — a hide's contribution to the feed drop. */
  attached?: number;
};

// Mirrors normalizeAliasName in taxonomy.service.ts — the CLI needs the same
// normalization to read back what a merge wrote.
const normalizeAlias = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s_./-]+/g, "");

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const planPath = argFor(argv, "--plan");
  const onlyPhase = argFor(argv, "--phase");
  if (!planPath) throw new Error("--plan <path-to-plan.json> is required");

  const logger = new Logger("taxonomy:migrate");
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as Plan;
  const phases = plan.phases
    .filter((p) => onlyPhase === undefined || String(p.phase) === onlyPhase)
    .sort((a, b) => a.phase - b.phase);
  if (phases.length === 0) throw new Error(`no phases matched (--phase ${onlyPhase ?? "*"})`);

  const app = await NestFactory.createApplicationContext(TaxonomyMigrateCliModule, {
    logger: ["warn", "error"],
  });

  try {
    const db = app.get<DrizzleDB>(DRIZZLE);
    const svc = app.get(TaxonomyService);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = `.private/journal/taxonomy-migration-${plan.name}-${stamp}.jsonl`;

    const before = await totals(db);
    logger.log(
      `plan "${plan.name}" — ${phases.length} phase(s), mode=${apply ? "APPLY" : "DRY-RUN"}`,
    );
    logger.log(
      `baseline: ${before.vacancies} vacancies, ${before.withRole} with a role, ${before.feedVisible} feed-visible`,
    );

    // Resolve the whole plan before touching anything, so one pass surfaces every
    // problem instead of stopping at the first.
    const overlay: Overlay = { nodes: new Map(), aliases: new Map() };
    const resolvedByPhase: { phase: number; title: string; items: Resolved[] }[] = [];
    for (const p of phases) {
      const items: Resolved[] = [];
      for (const op of p.ops) {
        const r = await resolve(db, op, overlay);
        project(overlay, r);
        items.push(r);
      }
      resolvedByPhase.push({ phase: p.phase, title: p.title, items });
    }

    for (const { phase, title, items } of resolvedByPhase) {
      process.stdout.write(`\n[phase ${phase} — ${title}]\n`);
      for (const r of items) {
        process.stdout.write(`  ${label(r)}\n`);
        for (const d of r.detail) process.stdout.write(`          ${d}\n`);
      }
    }

    const all = resolvedByPhase.flatMap((p) => p.items);
    const refusals = all.filter((r) => r.verdict === "REFUSE");
    const warns = all.filter((r) => r.verdict === "WARN");
    const toApply = all.filter((r) => r.verdict === "APPLY" || r.verdict === "WARN");
    const skips = all.filter((r) => r.verdict === "SKIP");

    process.stdout.write(
      `\nSUMMARY  apply ${toApply.length}  skip ${skips.length}  refuse ${refusals.length}  warn ${warns.length}\n`,
    );
    await reportImpact(db, all);

    if (refusals.length > 0) {
      process.stdout.write(`\nREFUSED — nothing applied. Fix the plan and re-run.\n`);
      process.exit(2);
    }
    if (!apply) {
      process.stdout.write(`\nDRY-RUN complete. Re-run with --apply to execute.\n`);
      process.exit(warns.length > 0 ? 1 : 0);
    }

    mkdirSync(dirname(logPath), { recursive: true });
    let applied = 0;
    for (const { phase, items } of resolvedByPhase) {
      for (const r of items) {
        if (r.verdict === "SKIP") continue;
        // Written before the call too: a merge deletes the source, and after that
        // the source→target mapping exists nowhere else in the system. The
        // subscription and redirect repairs both read this file.
        const entry = { ts: new Date().toISOString(), phase, ...flatten(r) };
        appendFileSync(logPath, `${JSON.stringify({ ...entry, state: "before" })}\n`);
        const result = await execute(svc, r);
        appendFileSync(logPath, `${JSON.stringify({ ...entry, state: "after", result })}\n`);
        applied += 1;
        process.stdout.write(`  applied ${describe(r.op)}\n`);
      }
    }

    // The merge map only exists in this process: once mergeInto deletes a source
    // node, nothing in the database can map its uuid to the target any more. So
    // the subscription repair and the matview refresh happen here, in the same
    // run, rather than as a follow-up someone has to remember.
    await repairSubscriptions(
      db,
      resolvedByPhase.flatMap((p) => p.items),
    );
    await refreshDerived(db);

    const after = await totals(db);
    process.stdout.write(`\nAPPLIED ${applied} operation(s). Audit log: ${logPath}\n`);
    process.stdout.write(
      `conservation: vacancies ${before.vacancies} -> ${after.vacancies}` +
        `${before.vacancies === after.vacancies ? " OK" : "  *** CHANGED ***"}\n`,
    );
    process.stdout.write(
      `              with-role ${before.withRole} -> ${after.withRole}` +
        `${before.withRole === after.withRole ? " OK" : "  *** CHANGED ***"}\n`,
    );
    process.stdout.write(`feed-visible: ${before.feedVisible} -> ${after.feedVisible}\n`);
    const expectedHidden = resolvedByPhase
      .flatMap((p) => p.items)
      .filter((r) => r.op.op === "hide" && r.verdict !== "SKIP" && r.verdict !== "REFUSE")
      .reduce((n, r) => n + (r.attached ?? 0), 0);
    await reportRoleVisibility(db, expectedHidden, before.feedVisible - after.feedVisible);
    await postChecks(db);
  } finally {
    await app.close();
  }
}

// Records what an APPLY-verdict op will do, so subsequent ops resolve against the
// projected state rather than the untouched database.
function project(ov: Overlay, r: Resolved): void {
  if (r.verdict === "REFUSE" || r.verdict === "SKIP") return;
  const { op } = r;
  if (op.op === "rename") {
    const row = ov.nodes.get(key(op.type, op.from)) ?? null;
    ov.nodes.set(key(op.type, op.from), null);
    ov.nodes.set(
      key(op.type, op.to),
      row ?? { id: r.sourceId as string, status: "VERIFIED", slug: null },
    );
    ov.aliases.set(key(op.type, normalizeAlias(op.from)), r.sourceId as string);
    return;
  }
  if (op.op === "merge") {
    ov.nodes.set(key(op.type, op.from), null);
    ov.aliases.set(key(op.type, normalizeAlias(op.from)), r.targetId as string);
    return;
  }
  const status = op.op === "hide" ? "HIDDEN" : "VERIFIED";
  ov.nodes.set(key(op.type, op.name), { id: r.sourceId as string, status, slug: null });
}

async function resolve(db: DrizzleDB, op: PlanOp, ov: Overlay): Promise<Resolved> {
  // Resolve by exact canonical_name ONLY. Going through node_aliases would
  // resolve an already-renamed or already-merged name to its successor and make
  // every idempotency check answer wrongly.
  const nameOf = op.op === "rename" || op.op === "merge" ? op.from : op.name;
  const src = await byCanonical(db, op.type, nameOf, ov);

  if (op.op === "rename") {
    if (src) {
      const conflict = await renameConflict(db, op.type, op.to, src.id);
      if (conflict) {
        return refuse(op, `target name "${op.to}" already belongs to ${conflict}`);
      }
      return {
        op,
        verdict: "APPLY",
        reason: "",
        sourceId: src.id,
        detail: [
          `slug stays '${src.slug ?? "(null)"}' (immutable on rename)`,
          `aliases after: +${normalizeAlias(op.from)} +${normalizeAlias(op.to)}`,
        ],
      };
    }
    const already = await byCanonical(db, op.type, op.to, ov);
    if (already) return skip(op, `already renamed (${op.to} exists)`);
    return refuse(op, `neither "${op.from}" nor "${op.to}" exists as a ${op.type}`);
  }

  if (op.op === "merge") {
    const tgt = await byCanonical(db, op.type, op.into, ov);
    if (!tgt)
      return refuse(op, `target "${op.into}" does not exist — is an earlier phase pending?`);
    if (tgt.status !== "VERIFIED")
      return refuse(op, `target "${op.into}" is ${tgt.status}, must be VERIFIED`);

    if (!src) {
      const alias = await aliasOwner(db, op.type, op.from, ov);
      if (alias === tgt.id) return skip(op, "already merged (alias points at target)");
      if (alias)
        return refuse(op, `source gone but its alias points at a different node (${alias})`);
      return refuse(op, `source "${op.from}" gone and no alias — deleted outside the service?`);
    }
    if (src.id === tgt.id) return skip(op, "source and target are the same node");

    const moving = await count(
      db,
      sql`SELECT count(*) FROM vacancies WHERE role_node_id = ${src.id}`,
    );
    const presets = await trackPresets(db, src.id);
    const detail = [
      `vacancies.role_node_id: ${moving} row(s) repointed`,
      `slug '${src.slug ?? "(null)"}' retired onto target (308-able)`,
    ];
    if (presets.length > 0) {
      detail.push(`track presets repointed to target: ${presets.map((p) => p.slug).join(", ")}`);
    }
    return { op, verdict: "APPLY", reason: "", sourceId: src.id, targetId: tgt.id, detail };
  }

  // hide / verify
  if (!src) return skip(op, `"${op.name}" does not exist`);
  const want = op.op === "hide" ? "HIDDEN" : "VERIFIED";
  if (src.status === want) return skip(op, `already ${want}`);
  if (op.op === "verify" && src.status === "HIDDEN") {
    return refuse(op, "refusing HIDDEN -> VERIFIED: an operator's hide verdict is final");
  }
  const attached = await count(
    db,
    sql`SELECT count(*) FROM vacancies WHERE role_node_id = ${src.id}`,
  );
  const detail =
    op.op === "hide" && attached > 0
      ? [`!! ${attached} vacanc(ies) still attached — they leave the feed`]
      : [];
  return {
    op,
    verdict: op.op === "hide" && attached > 0 ? "WARN" : "APPLY",
    reason: op.op === "hide" && attached > 0 ? `${attached} vacancies leave the feed` : "",
    sourceId: src.id,
    attached,
    detail,
  };
}

async function execute(svc: TaxonomyService, r: Resolved) {
  const { op } = r;
  if (op.op === "rename") return svc.renameNode(r.sourceId as string, op.to);
  if (op.op === "merge") return svc.mergeInto(r.sourceId as string, r.targetId as string);
  return svc.setStatus(r.sourceId as string, op.op === "hide" ? "HIDDEN" : "VERIFIED");
}

async function reportImpact(db: DrizzleDB, all: Resolved[]) {
  const merges = all.filter(
    (r) => r.op.op === "merge" && r.verdict !== "SKIP" && r.verdict !== "REFUSE",
  );
  const hides = all.filter(
    (r) => r.op.op === "hide" && r.verdict !== "SKIP" && r.verdict !== "REFUSE",
  );
  const ids = [...merges, ...hides].map((r) => r.sourceId).filter(Boolean) as string[];
  if (ids.length === 0) return;

  const { rows } = await db.execute<{ hubs: string; vacancies: string }>(sql`
    SELECT count(*) FILTER (WHERE v.c >= 3)::text AS hubs, coalesce(sum(v.c), 0)::text AS vacancies
    FROM (
      SELECT n.id, (SELECT count(*) FROM vacancies x WHERE x.role_node_id = n.id) AS c
      FROM nodes n WHERE n.id = ANY(${sql.raw(`ARRAY['${ids.join("','")}']::uuid[]`)})
    ) v
  `);
  const r = rows[0];
  process.stdout.write(
    `         indexed /role hubs affected (count>=3): ${r?.hubs ?? 0}` +
      ` — need a 308 from the audit log's retired slugs\n`,
  );
  process.stdout.write(`         vacancies moving or leaving: ${r?.vacancies ?? 0}\n`);
}

// Rewrites subscriptions.params in place: merged node uuids follow their target,
// uuids with no surviving VERIFIED node are dropped, and the result is deduped.
// `params` is JSONB with no FK, so nothing else in the system would ever notice a
// dead uuid — the filter arm just silently stops matching.
async function repairSubscriptions(db: DrizzleDB, items: Resolved[]): Promise<void> {
  const remap = new Map<string, string>();
  for (const r of items) {
    if (r.op.op === "merge" && r.verdict !== "SKIP" && r.verdict !== "REFUSE" && r.sourceId) {
      remap.set(r.sourceId, r.targetId as string);
    }
  }

  const { rows: live } = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM nodes WHERE status = 'VERIFIED'
  `);
  const verified = new Set(live.map((r) => r.id));

  const { rows: subs } = await db.execute<{
    id: string;
    is_active: boolean;
    role_ids: string[] | null;
    skill_ids: string[] | null;
  }>(sql`
    SELECT id::text, is_active,
           CASE WHEN params ? 'roleIds'
                THEN ARRAY(SELECT jsonb_array_elements_text(params->'roleIds')) END AS role_ids,
           CASE WHEN params ? 'skillIds'
                THEN ARRAY(SELECT jsonb_array_elements_text(params->'skillIds')) END AS skill_ids
    FROM subscriptions
  `);

  process.stdout.write(`\nsubscription repair (${subs.length} row(s) inspected):\n`);
  let rewritten = 0;
  const narrowed: string[] = [];
  const wouldSilence: string[] = [];

  for (const s of subs) {
    const fix = (ids: string[] | null) => {
      if (!ids) return null;
      const out: string[] = [];
      for (const id of ids) {
        const mapped = remap.get(id) ?? id;
        if (verified.has(mapped) && !out.includes(mapped)) out.push(mapped);
      }
      return out;
    };
    const roles = fix(s.role_ids);
    const skills = fix(s.skill_ids);
    const roleChanged = roles !== null && !sameIds(roles, s.role_ids ?? []);
    const skillChanged = skills !== null && !sameIds(skills, s.skill_ids ?? []);
    if (!roleChanged && !skillChanged) continue;

    // Refuse to empty a filter that had arms: that silences a live user with no
    // trace. Report it and leave the row for a human instead.
    const emptiesRoles = roles !== null && roles.length === 0 && (s.role_ids?.length ?? 0) > 0;
    const emptiesSkills = skills !== null && skills.length === 0 && (s.skill_ids?.length ?? 0) > 0;
    if (s.is_active && (emptiesRoles || emptiesSkills)) {
      wouldSilence.push(s.id);
      continue;
    }

    await db.execute(sql`
      UPDATE subscriptions SET params = params
        ${roles === null ? sql`` : sql`|| jsonb_build_object('roleIds', ${JSON.stringify(roles)}::jsonb)`}
        ${skills === null ? sql`` : sql`|| jsonb_build_object('skillIds', ${JSON.stringify(skills)}::jsonb)`}
      WHERE id = ${s.id}::uuid
    `);
    rewritten += 1;
    const lostRoles = (s.role_ids?.length ?? 0) - (roles?.length ?? 0);
    if (s.is_active && lostRoles > 0) narrowed.push(`${s.id} (-${lostRoles} role arm(s))`);
  }

  process.stdout.write(`  rewritten: ${rewritten}\n`);
  if (narrowed.length > 0) {
    process.stdout.write(
      `  narrowed (arms had no successor — worth telling these users):\n` +
        narrowed.map((n) => `    ${n}\n`).join(""),
    );
  }
  if (wouldSilence.length > 0) {
    process.stdout.write(
      `  !! LEFT ALONE — repairing would empty the filter, decide by hand:\n` +
        wouldSilence.map((n) => `    ${n}\n`).join(""),
    );
  }
}

// node_stats drives the matcher's IDF weights and node_skill_cooc its substitute
// gate; both are matviews keyed on nodes.id with no FK, so after a merge they
// quietly score against deleted nodes until refreshed.
async function refreshDerived(db: DrizzleDB): Promise<void> {
  process.stdout.write(`\nrefreshing derived views:\n`);
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY node_stats`);
  process.stdout.write(`  node_stats OK\n`);
  await db.execute(sql`REFRESH MATERIALIZED VIEW node_skill_cooc`);
  process.stdout.write(`  node_skill_cooc OK\n`);
}

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

async function postChecks(db: DrizzleDB) {
  process.stdout.write(`\npost-checks (all must be 0):\n`);
  const checks: [string, ReturnType<typeof sql>][] = [
    [
      "vacancies whose role node was DELETED (impossible via FK — sanity only)",
      sql`SELECT count(*) FROM vacancies v
          WHERE v.role_node_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = v.role_node_id)`,
    ],
    [
      "child tracks with zero presets (would inherit parent)",
      sql`SELECT count(*) FROM tracks t WHERE t.parent_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM track_nodes tn WHERE tn.track_id = t.id)`,
    ],
    [
      "subscriptions holding a dead node uuid",
      sql`SELECT count(*) FROM subscriptions s,
            jsonb_array_elements_text(coalesce(s.params->'roleIds','[]'::jsonb)
              || coalesce(s.params->'skillIds','[]'::jsonb)) nid
          WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = nid::uuid)`,
    ],
    [
      "active subscriptions with zero VERIFIED role arms",
      sql`SELECT count(*) FROM subscriptions s
          WHERE s.is_active AND jsonb_array_length(coalesce(s.params->'roleIds','[]'::jsonb)) > 0
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(s.params->'roleIds') rid
              JOIN nodes n ON n.id = rid::uuid WHERE n.status = 'VERIFIED')`,
    ],
    [
      "VERIFIED skills without node_tech_meta",
      sql`SELECT count(*) FROM nodes n WHERE n.type = 'SKILL' AND n.status = 'VERIFIED'
            AND NOT EXISTS (SELECT 1 FROM node_tech_meta m WHERE m.node_id = n.id)`,
    ],
    [
      "node_stats rows pointing at a deleted node (refresh needed)",
      sql`SELECT count(*) FROM node_stats s LEFT JOIN nodes n ON n.id = s.node_id WHERE n.id IS NULL`,
    ],
  ];
  for (const [name, q] of checks) {
    const n = await count(db, q);
    process.stdout.write(`  ${n === 0 ? "OK  " : "FAIL"}  ${name}: ${n}\n`);
  }
  process.stdout.write(
    `\nstill to do by hand: dedup-cli embed --force (renames changed the hashed` +
      ` embedding text), pnpm skills:classify if any skill was promoted,` +
      ` and 308s for the retired slugs in node_slug_aliases\n`,
  );
}

// Vacancies sitting on a NEW or HIDDEN role are normal, not a failure: the
// extractor is free to invent role names, and an operator's hide is final. So
// report the split rather than asserting zero — the meaningful assertion is that
// the feed lost exactly the vacancies this run's hides were carrying.
async function reportRoleVisibility(db: DrizzleDB, expectedHidden: number, lost: number) {
  const { rows } = await db.execute<{ status: string; vacancies: string; nodes: string }>(sql`
    SELECT n.status::text, count(*)::text AS vacancies, count(DISTINCT n.id)::text AS nodes
    FROM vacancies v JOIN nodes n ON n.id = v.role_node_id
    WHERE n.status <> 'VERIFIED' GROUP BY n.status ORDER BY 2 DESC
  `);
  process.stdout.write(`\nvacancies not visible in the feed, by role status:\n`);
  for (const r of rows) {
    process.stdout.write(
      `  ${r.status.padEnd(8)} ${r.vacancies} vacanc(ies) on ${r.nodes} node(s)\n`,
    );
  }
  const ok = lost === expectedHidden;
  process.stdout.write(
    `  ${ok ? "OK  " : "FAIL"}  feed lost ${lost}, this run's hides were carrying ${expectedHidden}\n`,
  );
}

async function byCanonical(db: DrizzleDB, type: NodeType, name: string, ov: Overlay) {
  if (ov.nodes.has(key(type, name))) return ov.nodes.get(key(type, name)) ?? undefined;
  const { rows } = await db.execute<NodeRow>(sql`
    SELECT id::text, status::text, slug FROM nodes WHERE type = ${type} AND canonical_name = ${name}
  `);
  return rows[0];
}

async function aliasOwner(db: DrizzleDB, type: NodeType, name: string, ov: Overlay) {
  const projected = ov.aliases.get(key(type, normalizeAlias(name)));
  if (projected) return projected;
  const { rows } = await db.execute<{ node_id: string }>(sql`
    SELECT node_id::text FROM node_aliases WHERE type = ${type} AND name = ${normalizeAlias(name)}
  `);
  return rows[0]?.node_id;
}

async function renameConflict(db: DrizzleDB, type: NodeType, newName: string, selfId: string) {
  const { rows } = await db.execute<{ who: string }>(sql`
    SELECT canonical_name AS who FROM nodes
      WHERE type = ${type} AND id <> ${selfId}::uuid AND lower(canonical_name) = lower(${newName})
    UNION ALL
    SELECT n.canonical_name FROM node_aliases a JOIN nodes n ON n.id = a.node_id
      WHERE a.type = ${type} AND a.node_id <> ${selfId}::uuid
        AND a.name = ${normalizeAlias(newName)}
    LIMIT 1
  `);
  return rows[0]?.who;
}

async function trackPresets(db: DrizzleDB, nodeId: string) {
  const { rows } = await db.execute<{ slug: string }>(sql`
    SELECT t.slug FROM track_nodes tn JOIN tracks t ON t.id = tn.track_id
    WHERE tn.node_id = ${nodeId}::uuid ORDER BY t.slug
  `);
  return rows;
}

async function totals(db: DrizzleDB) {
  return {
    vacancies: await count(db, sql`SELECT count(*) FROM vacancies`),
    withRole: await count(db, sql`SELECT count(*) FROM vacancies WHERE role_node_id IS NOT NULL`),
    feedVisible: await count(
      db,
      sql`SELECT count(*) FROM vacancies v JOIN nodes n ON n.id = v.role_node_id
          WHERE n.status = 'VERIFIED'`,
    ),
  };
}

async function count(db: DrizzleDB, q: ReturnType<typeof sql>): Promise<number> {
  const { rows } = await db.execute<{ count: string }>(q);
  return Number(rows[0]?.count ?? 0);
}

const argFor = (argv: string[], flag: string) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const refuse = (op: PlanOp, reason: string): Resolved => ({
  op,
  verdict: "REFUSE",
  reason,
  detail: [`!! ${reason}`],
});
const skip = (op: PlanOp, reason: string): Resolved => ({
  op,
  verdict: "SKIP",
  reason,
  detail: [],
});

function describe(op: PlanOp): string {
  if (op.op === "rename") return `RENAME  "${op.from}" -> "${op.to}"`;
  if (op.op === "merge") return `MERGE   "${op.from}" -> "${op.into}"`;
  return `${op.op.toUpperCase().padEnd(7)} "${op.name}"`;
}

const label = (r: Resolved) =>
  `${describe(r.op).padEnd(64)} [${r.verdict}${r.verdict === "SKIP" ? `: ${r.reason}` : ""}]`;

const flatten = (r: Resolved) => {
  const { op } = r;
  return {
    op: op.op,
    node_type: op.type,
    source_name: op.op === "rename" || op.op === "merge" ? op.from : op.name,
    source_id: r.sourceId ?? null,
    source_slug: r.detail.find((d) => d.includes("slug"))?.match(/'([^']*)'/)?.[1] ?? null,
    target_name: op.op === "rename" ? op.to : op.op === "merge" ? op.into : null,
    target_id: r.targetId ?? null,
  };
};

void main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
