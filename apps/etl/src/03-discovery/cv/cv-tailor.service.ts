import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";

import { Collector } from "@boundaryml/baml";
import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { b } from "../../baml_client";
import { RankingService } from "../ranking/ranking.service";
import { RecommendationService } from "../ranking/recommendation.service";

import { CandidateLoaderService } from "./candidate-loader.service";
import type {
  ApplyKitRequest,
  ApplyKitResult,
  BulletDiff,
  CoverLetterDraft,
  Disclosure,
  DriftFlag,
  EntitySet,
  ExtractedResume,
  FactAtom,
  FactLedger,
  GroundingSummary,
  GuardDemoCase,
  GuardResult,
  InterviewItem,
  MatchLevel,
  SkillGroup,
  TailorGap,
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
interface Ranked {
  atom: FactAtom;
  relevance: number;
}

@Injectable()
export class CvTailorService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly ranking: RankingService,
    private readonly recommendation: RecommendationService,
    private readonly loader: CandidateLoaderService,
    @Optional() @Inject(TAILOR_REPHRASER) private readonly rephraser: TailorRephraserPort | null,
  ) {}

  // ── Tailor ──────────────────────────────────────────────────────────────────

  async tailor(candidateId: string, req: TailorRequest): Promise<TailorResult> {
    const resume = await this.loadStructured(candidateId);
    const { skills: targetSkills, label, vacancyId } = await this.resolveTarget(req);
    const byName = new Map(targetSkills.map((s) => [s.name.toLowerCase(), s.weight]));
    const ledger = buildLedger(resume);
    // Light never calls the LLM (every word stays the candidate's); medium/hard
    // rephrase unless the caller opts out or no provider is bound.
    const level: MatchLevel = req.level ?? "medium";
    const rephraseOn = level !== "light" && req.rephrase !== false && this.rephraser != null;
    const emphasis = targetSkills.map((s) => s.name).slice(0, 15);

    // 1. select + reorder each entry (deterministic, always)
    const expSel = resume.experience.map((e) => ({
      e,
      ...selectBullets(e.bullets, e.max ?? DEFAULT_EXP_BULLETS, byName),
    }));
    const projSel = resume.projects.map((p) => ({
      p,
      ...selectBullets(p.bullets, DEFAULT_PROJ_BULLETS, byName),
    }));

    // 2. one bold rewrite over every shown bullet (+ summary); degrade to verbatim
    const rewritten = new Map<string, string>();
    if (rephraseOn && this.rephraser) {
      const toRewrite = [
        { id: resume.summary.id, text: resume.summary.text },
        ...expSel.flatMap((s) => s.selected.map((x) => ({ id: x.atom.id, text: x.atom.text }))),
        ...projSel.flatMap((s) => s.selected.map((x) => ({ id: x.atom.id, text: x.atom.text }))),
      ];
      try {
        const out = await this.rephraser.rephraseBatch({
          bullets: toRewrite,
          role: label,
          emphasis,
        });
        for (const o of out) rewritten.set(o.id, o.text);
      } catch {
        // rewrite unavailable (no key / API error) → every bullet stays verbatim
      }
    }

    const counts = { rephrased: 0, drift: 0 };
    const mk = (atom: FactAtom, relevance: number, dropped = false): BulletDiff => {
      if (dropped)
        return bulletDiff(atom, atom.text, "dropped", relevance, faithful(atom.entities));
      const rw = rewritten.get(atom.id)?.trim();
      if (rw && rw !== atom.text.trim()) {
        const verdict = checkBullet({
          sourceText: atom.text,
          tailoredText: rw,
          sourceEntities: atom.entities,
          ledger: { tech: ledger.tech, orgs: ledger.orgs, titles: ledger.titles },
        });
        if (verdict.faithful) {
          counts.rephrased += 1;
          return bulletDiff(atom, rw, "rephrased", relevance, verdict);
        }
        counts.drift += 1; // guard rejected the rewrite → keep the verbatim source
      }
      return bulletDiff(atom, atom.text, "verbatim", relevance, faithful(atom.entities));
    };

    const summary = mk(resume.summary, relevance(resume.summary, byName));
    const experience: TailoredExperience[] = expSel.map(({ e, selected, dropped }) => ({
      ...e,
      bullets: selected.map((x) => mk(x.atom, x.relevance)),
      dropped: dropped.map((x) => mk(x.atom, x.relevance, true)),
    }));
    const projects: TailoredProject[] = projSel.map(({ p, selected, dropped }) => ({
      ...p,
      bullets: selected.map((x) => mk(x.atom, x.relevance)),
      dropped: dropped.map((x) => mk(x.atom, x.relevance, true)),
    }));

    const shown =
      1 +
      experience.reduce((s, e) => s + e.bullets.length, 0) +
      projects.reduce((s, p) => s + p.bullets.length, 0);
    const total =
      1 +
      resume.experience.reduce((s, e) => s + e.bullets.length, 0) +
      resume.projects.reduce((s, p) => s + p.bullets.length, 0);
    const grounding: GroundingSummary = {
      totalBullets: total,
      shown,
      verbatim: shown - counts.rephrased - counts.drift,
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
    const gap =
      targetSkills.length > 0 ? await this.computeGap(candidateId, targetSkills, ledger) : null;

    // Hard match deliberately surfaces the vacancy's must-have skills that the CV
    // lacks — as a clearly-flagged group, never laundered into the real ones. The
    // disclosure below hands the "do you actually know this?" call to the user.
    const addedSkills = level === "hard" && gap ? gap.missing.map((m) => m.name) : [];
    const skills = reorderSkills(resume.skills, byName);
    if (addedSkills.length > 0) {
      skills.push({ group: "Added for this role — verify", items: addedSkills, added: true });
    }
    const droppedCount =
      experience.reduce((s, e) => s + e.dropped.length, 0) +
      projects.reduce((s, p) => s + p.dropped.length, 0);
    const disclosure = buildDisclosure({
      rephrased: counts.rephrased,
      dropped: droppedCount,
      reordered: target.matchedSkills.length > 0,
      addedSkills,
    });

    return {
      candidateId,
      target,
      level,
      rephrase: rephraseOn,
      grounding,
      gap,
      disclosure,
      resume: {
        name: resume.name,
        title: resume.title,
        contacts: resume.contacts,
        summary,
        skills,
        experience,
        projects,
        education: resume.education,
      },
    };
  }

  // ── Apply-kit (cover letter + interview) ──────────────────────────────────────

  async applyKit(candidateId: string, req: ApplyKitRequest): Promise<ApplyKitResult> {
    const resume = await this.loadStructured(candidateId);
    const { skills: targetSkills, label, vacancyId } = await this.resolveTarget(req);
    const byName = new Map(targetSkills.map((s) => [s.name.toLowerCase(), s.weight]));
    const ledger = buildLedger(resume);
    const haveNames = new Set(ledger.tech.map((t) => t.toLowerCase()));
    const strengths = targetSkills
      .filter((s) => haveNames.has(s.name.toLowerCase()))
      .map((s) => s.name);
    const gaps = targetSkills
      .filter((s) => !haveNames.has(s.name.toLowerCase()))
      .map((s) => s.name);

    const picks: string[] = [];
    for (const e of resume.experience) {
      selectBullets(e.bullets, Math.min(3, e.max ?? DEFAULT_EXP_BULLETS), byName).selected.forEach(
        (x) => picks.push(x.atom.text),
      );
    }
    for (const p of resume.projects) {
      selectBullets(p.bullets, 2, byName).selected.forEach((x) => picks.push(x.atom.text));
    }
    const achievements = picks.map((t) => `- ${t}`).join("\n");
    const company = vacancyId
      ? ((await this.vacancyCompany(vacancyId)) ?? "the company")
      : "the company";

    const [letter, questions] = await Promise.all([
      b.DraftCoverLetter(resume.name, label, company, achievements, {
        collector: new Collector("cover-letter"),
      }),
      b.InterviewPrep(label, strengths.join(", ") || "—", gaps.join(", ") || "—", achievements, {
        collector: new Collector("interview"),
      }),
    ]);

    const coverLetter: CoverLetterDraft = {
      text: letter.text,
      flags: letterFlags(letter.text, ledger),
    };
    const interview: InterviewItem[] = questions.map((q) => ({
      question: q.question,
      angle: q.angle,
      evidence: q.evidence,
    }));
    const target: TailorTarget = {
      vacancyId,
      label,
      matchedSkills: strengths,
      allSkills: targetSkills.map((s) => s.name),
    };
    return { target, coverLetter, interview };
  }

  // ── Structure extraction ──────────────────────────────────────────────────────

  // Parse a full structured resume from the candidate's CV text (one LLM call)
  // and persist it to candidates.structured. Idempotent unless force=true.
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

  // ── Guard surfaces ────────────────────────────────────────────────────────────

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
        title: "Bold rewrite — same facts, sharper voice",
        note: "Impact-first, but same tech (Gemini) and same number (2,800+).",
        sourceText:
          "Owned the AI product-mockup pipeline: it applies a client's logo with Gemini, then an LLM scores six quality checks — 2,800+ mockups generated with no manual review.",
        tailoredText:
          "Shipped 2,800+ client-logo product mockups with zero manual review — a Gemini pipeline that auto-scores six quality checks and rejects weak results.",
        sourceEntities: entities({ tech: ["Gemini"], metrics: ["2,800+"] }),
        ledgerTech,
        expectedFaithful: true,
      },
      {
        title: "Scope kept honest",
        note: "Foregrounds the search work for a search role — verbatim, trivially grounded.",
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
        note: "The rewrite slips in Kubernetes, which the source never mentioned.",
        sourceText: "Built async workflows on RabbitMQ with PostgreSQL.",
        tailoredText: "Architected async workflows on RabbitMQ, Kubernetes, and PostgreSQL.",
        sourceEntities: entities({ tech: ["RabbitMQ", "PostgreSQL"] }),
        ledgerTech,
        expectedFaithful: false,
      },
      {
        title: "Inflated number — REJECTED",
        note: "2,800+ quietly becomes 5,000+. Numbers must be copied exactly.",
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
    req: TailorRequest | ApplyKitRequest,
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
      .where(eq(schema.vacancyNodes.vacancyId, vacancyId));
    return rows.map((r) => ({ name: r.name, weight: r.weight ?? 0 }));
  }

  private async vacancyTitle(vacancyId: string): Promise<string | null> {
    const rows = await this.db
      .select({ title: schema.vacancies.title })
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, vacancyId));
    return rows[0]?.title ?? null;
  }

  private async vacancyCompany(vacancyId: string): Promise<string | null> {
    const rows = await this.db
      .select({ name: schema.companies.name })
      .from(schema.vacancies)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.vacancies.companyId))
      .where(eq(schema.vacancies.id, vacancyId));
    return rows[0]?.name ?? null;
  }

  private async computeGap(
    candidateId: string,
    targetSkills: TargetSkill[],
    ledger: FactLedger,
  ): Promise<TailorGap> {
    const have = new Set(ledger.tech.map((t) => t.toLowerCase()));
    const totalW = targetSkills.reduce((s, x) => s + x.weight, 0) || 1;
    const haveW = targetSkills
      .filter((s) => have.has(s.name.toLowerCase()))
      .reduce((s, x) => s + x.weight, 0);
    const missing = targetSkills
      .filter((s) => !have.has(s.name.toLowerCase()))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((s) => ({ name: s.name, weight: Math.round(s.weight * 1000) / 1000 }));

    let learnNext: { skill: string; addedRoles: number }[] = [];
    try {
      const { matched, role, seniority } = await this.loader.getRecommendInput(candidateId);
      const roleNodeId = await this.ranking.resolveRole(role);
      const rec = await this.recommendation.recommend(matched, roleNodeId, seniority);
      learnNext = rec.items.slice(0, 3).map((it) => ({ skill: it.name, addedRoles: it.unlocks }));
    } catch {
      // recommender is best-effort — a small/edge cohort just yields no unlocks
    }
    return { fitPercent: Math.round((100 * haveW) / totalW), missing, learnNext };
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function entities(p: Partial<EntitySet>): EntitySet {
  return { tech: [], orgs: [], metrics: [], dates: [], titles: [], ...p };
}

function selectBullets(
  bullets: FactAtom[],
  max: number,
  byName: Map<string, number>,
): { selected: Ranked[]; dropped: Ranked[] } {
  const ranked = bullets
    .map((atom, index) => ({ atom, index, relevance: relevance(atom, byName) }))
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index);
  return {
    selected: ranked.slice(0, max).map(({ atom, relevance: r }) => ({ atom, relevance: r })),
    dropped: ranked.slice(max).map(({ atom, relevance: r }) => ({ atom, relevance: r })),
  };
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

// The honesty strip: one plain sentence per deviation from the literal original.
// added-skill lines are verify:true — they assert something not in the CV.
// Exported for unit testing (the verify-flag mapping must never silently flip).
export function buildDisclosure(input: {
  rephrased: number;
  dropped: number;
  reordered: boolean;
  addedSkills: string[];
}): Disclosure[] {
  const out: Disclosure[] = [];
  const plural = (n: number): string => (n === 1 ? "" : "s");
  for (const name of input.addedSkills) {
    out.push({
      kind: "added-skill",
      text: `Added "${name}" — the vacancy asks for it and it isn't in your CV. Keep it only if you can back it up.`,
      verify: true,
    });
  }
  if (input.rephrased > 0) {
    out.push({
      kind: "reworded",
      text: `Reworded ${input.rephrased} bullet${plural(input.rephrased)} for impact — no facts, numbers, or tools were invented (guard-checked).`,
      verify: false,
    });
  }
  if (input.dropped > 0) {
    out.push({
      kind: "dropped",
      text: `Hid ${input.dropped} less-relevant bullet${plural(input.dropped)} — nothing was deleted, restore any from the CV view.`,
      verify: false,
    });
  }
  if (input.reordered) {
    out.push({
      kind: "reordered",
      text: "Reordered your skills and bullets to lead with what this vacancy prioritizes.",
      verify: false,
    });
  }
  return out;
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
  for (const exp of resume.experience) exp.bullets.forEach((bl) => add(bl.entities));
  for (const proj of resume.projects) proj.bullets.forEach((bl) => add(bl.entities));
  const uniq = (xs: string[]): string[] => [...new Set(xs)];
  return {
    tech: uniq(acc.tech),
    orgs: uniq(acc.orgs),
    metrics: uniq(acc.metrics),
    dates: uniq(acc.dates),
    titles: uniq(acc.titles),
  };
}

// A bullet's entities are derived with the SAME tokenizer the guard uses, so the
// source ledger and the guard's view never disagree.
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
    sourceSpan: text,
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

function letterFlags(text: string, ledger: FactLedger): DriftFlag[] {
  const flags: DriftFlag[] = [];
  const allowedTech = new Set(ledger.tech.map((t) => t.toLowerCase()));
  for (const t of extractTech(text)) {
    if (!allowedTech.has(t.toLowerCase())) {
      flags.push({ kind: "added-tech", token: t, message: `"${t}" isn't anywhere in your CV.` });
    }
  }
  // In prose, only "hard" quantified claims (%, +, magnitude) are worth flagging —
  // bare integers ("3 teams", "one platform") are too false-positive-prone.
  const allowedMetrics = new Set(ledger.metrics.flatMap((m) => extractMetrics(m)));
  const isHardMetric = (m: string): boolean => /[%+kmb]/.test(m);
  for (const m of extractMetrics(text)) {
    if (isHardMetric(m) && !allowedMetrics.has(m)) {
      flags.push({
        kind: "invented-metric",
        token: m,
        message: `the number "${m}" isn't in your CV.`,
      });
    }
  }
  return flags;
}
