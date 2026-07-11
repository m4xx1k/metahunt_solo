import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";

import { Collector } from "@boundaryml/baml";
import { and, eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { b } from "../../baml_client";
import { RankingService } from "../ranking/ranking.service";

import type {
  BulletDiff,
  EntitySet,
  ExtractedResume,
  FactAtom,
  FactLedger,
  GroundingSummary,
  GuardDemoCase,
  GuardResult,
  SkillGroup,
  TailorRequest,
  TailorResult,
  TailorTarget,
  TailoredExperience,
  TailoredProject,
  VerifyBulletRequest,
} from "./cv-tailor.contract";
import { TAILOR_REPHRASER, type TailorRephraserPort } from "./cv-tailor.rephraser.port";
import { checkBullet, extractMetrics, extractTech } from "./subset-guard";

const DEFAULT_EXP_BULLETS = 4;
const DEFAULT_PROJ_BULLETS = 3;

interface TargetSkill {
  name: string;
  weight: number;
}

@Injectable()
export class CvTailorService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ranking: RankingService,
    @Optional() @Inject(TAILOR_REPHRASER) private readonly rephraser: TailorRephraserPort | null,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async tailor(candidateId: string, req: TailorRequest): Promise<TailorResult> {
    const resume = await this.loadStructured(candidateId);
    const { skills: targetSkills, label, vacancyId } = await this.resolveTarget(req);
    const byName = new Map(targetSkills.map((s) => [s.name.toLowerCase(), s.weight]));
    const ledger = buildLedger(resume);
    const rephraseOn = req.rephrase === true && this.rephraser != null;

    const counts = { total: 0, shown: 0, verbatim: 0, rephrased: 0, drift: 0 };

    const experience: TailoredExperience[] = [];
    for (const exp of resume.experience) {
      const { bullets, dropped } = await this.tailorBullets(
        exp.bullets,
        exp.max ?? DEFAULT_EXP_BULLETS,
        byName,
        ledger,
        rephraseOn,
        counts,
      );
      experience.push({ ...exp, bullets, dropped });
    }

    const projects: TailoredProject[] = [];
    for (const proj of resume.projects) {
      const { bullets, dropped } = await this.tailorBullets(
        proj.bullets,
        DEFAULT_PROJ_BULLETS,
        byName,
        ledger,
        rephraseOn,
        counts,
      );
      projects.push({ ...proj, bullets, dropped });
    }

    // Summary stays verbatim in v1 (rephrasing it is a v2 upgrade).
    counts.total += 1;
    counts.shown += 1;
    counts.verbatim += 1;
    const summary = this.verbatimDiff(resume.summary, byName);

    const grounding: GroundingSummary = {
      totalBullets: counts.total,
      shown: counts.shown,
      verbatim: counts.verbatim,
      rephrased: counts.rephrased,
      drift: counts.drift,
      inventedFacts: 0,
    };

    const target: TailorTarget = {
      vacancyId,
      label,
      matchedSkills: targetSkills
        .filter((s) => ledger.tech.some((t) => t.toLowerCase() === s.name.toLowerCase()))
        .map((s) => s.name),
      allSkills: targetSkills.map((s) => s.name),
    };

    return {
      candidateId,
      target,
      rephrase: rephraseOn,
      grounding,
      resume: {
        name: resume.name,
        title: resume.title,
        contacts: resume.contacts,
        summary,
        skills: reorderSkills(resume.skills, byName),
        experience,
        projects,
        education: resume.education,
      },
    };
  }

  // Extract a full structured resume from the candidate's CV text (one LLM call)
  // and persist it to candidates.structured so the CV can be tailored. Idempotent:
  // returns the existing structure without an LLM call unless force=true.
  async structure(candidateId: string, force = false): Promise<{ hasStructured: boolean }> {
    const rows = await this.db
      .select({
        sourceText: schema.candidates.sourceText,
        structured: schema.candidates.structured,
      })
      .from(schema.candidates)
      .where(eq(schema.candidates.id, candidateId));
    if (!rows[0]) throw new NotFoundException(`candidate ${candidateId} not found`);
    if (rows[0].structured && !force) return { hasStructured: true };

    const collector = new Collector("cv-structure");
    const extracted = await b.ExtractResume(rows[0].sourceText, { collector });
    const structured = toStructuredResume(extracted);
    await this.db
      .update(schema.candidates)
      .set({ structured: structured as unknown as Record<string, unknown> })
      .where(eq(schema.candidates.id, candidateId));
    return { hasStructured: true };
  }

  // Live re-check of a manual edit (no LLM) — the guard, exposed.
  verify(req: VerifyBulletRequest): GuardResult {
    return checkBullet({
      sourceText: req.sourceText,
      tailoredText: req.tailoredText,
      sourceEntities: req.sourceEntities,
      ledger: { tech: req.ledgerTech ?? [] },
    });
  }

  // Canned before→after cases run through the REAL Tier-1 guard, so the
  // "how the guard works" panel shows genuine verdicts with zero LLM.
  guardDemo(): GuardDemoCase[] {
    const ledgerTech = ["Gemini", "Elasticsearch", "PostgreSQL", "RabbitMQ", "AWS", "NestJS"];
    const cases: Omit<GuardDemoCase, "result">[] = [
      {
        title: "Faithful rephrase — tighter voice, same facts",
        note: "The founder's own backend→full-stack edit. Same tech (Gemini), same number (2,800+).",
        sourceText:
          "Owned the AI product-mockup pipeline: it applies a client's logo with Gemini, then an LLM scores six quality checks — 2,800+ mockups generated with no manual review.",
        tailoredText:
          "Replaced manual mockup creation with an AI pipeline — Gemini applies the logo, an LLM runs six quality checks — 2,800+ mockups shipped with no human review.",
        sourceEntities: entities({ tech: ["Gemini"], metrics: ["2,800+"] }),
        ledgerTech,
        expectedFaithful: true,
      },
      {
        title: "Reorder + select — no wording drift",
        note: "Foregrounds the search work for a search role. Verbatim, so trivially grounded.",
        sourceText:
          "Built core stages of the Elasticsearch search — retrieval, dedupe, scoring, LLM re-rank.",
        tailoredText:
          "Built core stages of the Elasticsearch search — retrieval, dedupe, scoring, LLM re-rank.",
        sourceEntities: entities({ tech: ["Elasticsearch"] }),
        ledgerTech,
        expectedFaithful: true,
      },
      {
        title: "Added technology — REJECTED",
        note: "A rewrite slips in Kubernetes, which the source never mentioned. The guard blocks it.",
        sourceText: "Built async workflows on RabbitMQ with PostgreSQL.",
        tailoredText: "Built async workflows on RabbitMQ and Kubernetes with PostgreSQL.",
        sourceEntities: entities({ tech: ["RabbitMQ", "PostgreSQL"] }),
        ledgerTech,
        expectedFaithful: false,
      },
      {
        title: "Inflated number — REJECTED",
        note: "2,800+ quietly becomes 5,000+. The guard requires numbers copied exactly.",
        sourceText: "2,800+ mockups generated with no manual review.",
        tailoredText: "5,000+ mockups generated with no manual review.",
        sourceEntities: entities({ metrics: ["2,800+"] }),
        ledgerTech,
        expectedFaithful: false,
      },
    ];
    return cases.map((c) => ({
      ...c,
      result: checkBullet({
        sourceText: c.sourceText,
        tailoredText: c.tailoredText,
        sourceEntities: c.sourceEntities,
        ledger: { tech: c.ledgerTech },
      }),
    }));
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async loadStructured(candidateId: string): Promise<ExtractedResume> {
    const rows = await this.db
      .select({ structured: schema.candidates.structured })
      .from(schema.candidates)
      .where(eq(schema.candidates.id, candidateId));
    if (!rows[0]) throw new NotFoundException(`candidate ${candidateId} not found`);
    const structured = rows[0].structured as ExtractedResume | null;
    if (!structured) {
      throw new BadRequestException(
        "this CV has no structured resume yet — it can't be tailored (parse it first)",
      );
    }
    return structured;
  }

  private async resolveTarget(
    req: TailorRequest,
  ): Promise<{ skills: TargetSkill[]; label: string; vacancyId: string | null }> {
    if (req.jobText && req.jobText.trim().length > 0) {
      const resolved = await this.ranking.resolveSkills(extractTech(req.jobText));
      return {
        skills: resolved.matched.map((m) => ({ name: m.name, weight: m.weight })),
        label: "Pasted job description",
        vacancyId: null,
      };
    }
    if (req.vacancyId) {
      const skills = await this.vacancySkills(req.vacancyId);
      const title = await this.vacancyTitle(req.vacancyId);
      return { skills, label: title ?? "Selected vacancy", vacancyId: req.vacancyId };
    }
    throw new BadRequestException("provide a vacancyId or a non-empty jobText");
  }

  private async vacancySkills(vacancyId: string): Promise<TargetSkill[]> {
    const rows = await this.db
      .select({ name: schema.nodes.canonicalName, weight: schema.nodeStats.weight })
      .from(schema.vacancyNodes)
      .innerJoin(schema.nodes, eq(schema.nodes.id, schema.vacancyNodes.nodeId))
      .leftJoin(schema.nodeStats, eq(schema.nodeStats.nodeId, schema.vacancyNodes.nodeId))
      .where(and(eq(schema.vacancyNodes.vacancyId, vacancyId), eq(schema.nodes.type, "SKILL")));
    return rows.map((r) => ({ name: r.name, weight: r.weight ?? 0 }));
  }

  private async vacancyTitle(vacancyId: string): Promise<string | null> {
    const rows = await this.db
      .select({ title: schema.vacancies.title })
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, vacancyId));
    return rows[0]?.title ?? null;
  }

  private async tailorBullets(
    bullets: FactAtom[],
    max: number,
    byName: Map<string, number>,
    ledger: FactLedger,
    rephraseOn: boolean,
    counts: { total: number; shown: number; verbatim: number; rephrased: number; drift: number },
  ): Promise<{ bullets: BulletDiff[]; dropped: BulletDiff[] }> {
    counts.total += bullets.length;

    const ranked = bullets
      .map((b, index) => ({ b, index, relevance: relevance(b, byName) }))
      .sort((x, y) => y.relevance - x.relevance || x.index - y.index);

    const selected = ranked.slice(0, max);
    const rest = ranked.slice(max);

    const out: BulletDiff[] = [];
    for (const { b, relevance: rel } of selected) {
      counts.shown += 1;
      if (rephraseOn && this.rephraser) {
        const tailoredText = await this.rephraser.rephrase({
          sourceText: b.text,
          allowed: b.entities,
          emphasis: [...byName.keys()],
        });
        const verdict = checkBullet({
          sourceText: b.text,
          tailoredText,
          sourceEntities: b.entities,
          ledger: { tech: ledger.tech, orgs: ledger.orgs, titles: ledger.titles },
        });
        if (verdict.faithful && tailoredText.trim() !== b.text.trim()) {
          counts.rephrased += 1;
          out.push(bulletDiff(b, tailoredText, "rephrased", rel, verdict));
          continue;
        }
        // Drift (or a no-op rephrase) → never ship it; fall back to verbatim.
        if (!verdict.faithful) counts.drift += 1;
      }
      counts.verbatim += 1;
      out.push(bulletDiff(b, b.text, "verbatim", rel, faithful(b.entities)));
    }

    const dropped = rest.map(({ b, relevance: rel }) =>
      bulletDiff(b, b.text, "dropped", rel, faithful(b.entities)),
    );
    return { bullets: out, dropped };
  }

  private verbatimDiff(atom: FactAtom, byName: Map<string, number>): BulletDiff {
    return bulletDiff(
      atom,
      atom.text,
      "verbatim",
      relevance(atom, byName),
      faithful(atom.entities),
    );
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function entities(p: Partial<EntitySet>): EntitySet {
  return { tech: [], orgs: [], metrics: [], dates: [], titles: [], ...p };
}

function bulletDiff(
  atom: FactAtom,
  tailoredText: string,
  mode: BulletDiff["mode"],
  relevance: number,
  verdict: GuardResult,
): BulletDiff {
  return {
    sourceBulletId: atom.id,
    sourceText: atom.text,
    tailoredText,
    mode,
    relevance,
    sourceEntities: atom.entities,
    verdict,
  };
}

function faithful(sourceEntities: EntitySet): GuardResult {
  return { faithful: true, flags: [], tailoredEntities: sourceEntities };
}

function relevance(atom: FactAtom, byName: Map<string, number>): number {
  let sum = 0;
  for (const t of atom.entities.tech) sum += byName.get(t.toLowerCase()) ?? 0;
  return Math.round(sum * 1000) / 1000;
}

function reorderSkills(groups: SkillGroup[], byName: Map<string, number>): SkillGroup[] {
  const groupScore = (g: SkillGroup): number =>
    g.items.reduce((s, it) => s + (byName.get(it.toLowerCase()) ?? 0), 0);
  const itemScore = (it: string): number => byName.get(it.toLowerCase()) ?? 0;
  return [...groups]
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => itemScore(b) - itemScore(a)) }))
    .sort((a, b) => groupScore(b) - groupScore(a));
}

function buildLedger(resume: ExtractedResume): FactLedger {
  const acc: FactLedger = { tech: [], orgs: [], metrics: [], dates: [], titles: [] };
  const add = (e: EntitySet): void => {
    acc.tech.push(...e.tech);
    acc.orgs.push(...e.orgs);
    acc.metrics.push(...e.metrics);
    acc.dates.push(...e.dates);
    acc.titles.push(...e.titles);
  };
  add(resume.summary.entities);
  for (const exp of resume.experience) exp.bullets.forEach((b) => add(b.entities));
  for (const proj of resume.projects) proj.bullets.forEach((b) => add(b.entities));
  const uniq = (xs: string[]): string[] => [...new Set(xs)];
  return {
    tech: uniq(acc.tech),
    orgs: uniq(acc.orgs),
    metrics: uniq(acc.metrics),
    dates: uniq(acc.dates),
    titles: uniq(acc.titles),
  };
}

// A bullet's entities are derived server-side with the SAME tokenizer the guard
// uses, so the source ledger and the guard's view never disagree.
function atomFromText(
  id: string,
  text: string,
  org: string,
  dates: string,
  title: string,
): FactAtom {
  return {
    id,
    text,
    sourceSpan: text, // the extracted bullet is copied verbatim from the CV
    entities: {
      tech: extractTech(text),
      orgs: org ? [org] : [],
      metrics: extractMetrics(text),
      dates: dates ? [dates] : [],
      titles: title ? [title] : [],
    },
  };
}

function toStructuredResume(ex: Awaited<ReturnType<typeof b.ExtractResume>>): ExtractedResume {
  return {
    name: ex.name,
    title: ex.title ?? "",
    contacts: {
      location: ex.contacts?.location ?? undefined,
      email: ex.contacts?.email ?? undefined,
      phone: ex.contacts?.phone ?? undefined,
      linkedin: ex.contacts?.linkedin ?? undefined,
      github: ex.contacts?.github ?? undefined,
      telegram: ex.contacts?.telegram ?? undefined,
    },
    summary: atomFromText("sum", ex.summary ?? "", "", "", ""),
    skills: (ex.skills ?? []).map((g) => ({ group: g.group, items: g.items ?? [] })),
    experience: (ex.experience ?? []).map((e, i) => ({
      id: `exp${i + 1}`,
      role: e.role,
      org: e.org,
      dates: e.dates,
      context: e.context,
      bullets: (e.bullets ?? []).map((t, j) =>
        atomFromText(`exp${i + 1}.b${j + 1}`, t, e.org, e.dates, e.role),
      ),
    })),
    projects: (ex.projects ?? []).map((p, i) => ({
      id: `pr${i + 1}`,
      name: p.name,
      meta: p.meta,
      link: p.link,
      context: p.context,
      bullets: (p.bullets ?? []).map((t, j) => atomFromText(`pr${i + 1}.b${j + 1}`, t, "", "", "")),
    })),
    education: (ex.education ?? []).map((ed) => ({
      degree: ed.degree,
      school: ed.school,
      dates: ed.dates,
    })),
  };
}
