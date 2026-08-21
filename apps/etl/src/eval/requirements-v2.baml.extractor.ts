import { Injectable } from "@nestjs/common";

import { Collector } from "@boundaryml/baml";

import { sha256 } from "../02-enrich/dedup/content-fingerprint";
import { BAML_RUNTIME_VERSION } from "../02-enrich/extraction/baml-production-identity.generated";
import type {
  ExtractionIdentity,
  ExtractionResult,
  ExtractionUsage,
  VacancyExtractor,
} from "../02-enrich/extraction/vacancy-extractor";
import { b, RequirementPriority, Seniority } from "../baml_client";
import type {
  ExtractedVacancy,
  ExtractedVacancyRequirementsV2,
  RequirementsV2Role,
} from "../baml_client";

/** Eval-only prompt; production continues to use ExtractVacancy unchanged. */
export const REQUIREMENTS_V2_PROMPT_VERSION = 4;
export const BAML_REQUIREMENTS_V2_SOURCE_HASH =
  "baa02d4d5644c5b7e63d9fea37a2245f3400f274c1d01fec7f3e0e1ed832f94a";

/** Intended post-role-v2 disciplines, isolated from the stale production ROLE nodes. */
const ROLE_DISPLAY_NAMES: Record<RequirementsV2Role, string> = {
  AI_ENGINEER: "AI Engineer",
  ANDROID_ENGINEER: "Android Engineer",
  AUTOMATION_QA_ENGINEER: "Automation QA Engineer",
  BACKEND_ENGINEER: "Backend Engineer",
  BLOCKCHAIN_ENGINEER: "Blockchain Engineer",
  BUSINESS_ANALYST: "Business Analyst",
  COMPUTER_VISION_ENGINEER: "Computer Vision Engineer",
  CROSS_PLATFORM_MOBILE_ENGINEER: "Cross-platform Mobile Engineer",
  DATA_ANALYST: "Data Analyst",
  DATA_ENGINEER: "Data Engineer",
  DATA_SCIENTIST: "Data Scientist",
  DATABASE_ENGINEER: "Database Engineer",
  DEVOPS_ENGINEER: "DevOps Engineer",
  EMBEDDED_ENGINEER: "Embedded Engineer",
  ENGINEERING_MANAGER: "Engineering Manager",
  ERP_CRM_ENGINEER: "ERP / CRM Engineer",
  FPGA_ENGINEER: "FPGA Engineer",
  FRONTEND_ENGINEER: "Frontend Engineer",
  FULL_STACK_ENGINEER: "Full Stack Engineer",
  GAME_ENGINEER: "Game Engineer",
  HARDWARE_ENGINEER: "Hardware Engineer",
  IOS_ENGINEER: "iOS Engineer",
  IT_SUPPORT_ENGINEER: "IT Support Engineer",
  MACHINE_LEARNING_ENGINEER: "Machine Learning Engineer",
  MANUAL_QA_ENGINEER: "Manual QA Engineer",
  NETWORK_ENGINEER: "Network Engineer",
  SECURITY_ENGINEER: "Security Engineer",
  SOFTWARE_ENGINEER: "Software Engineer",
  SYSTEMS_ADMINISTRATOR: "Systems Administrator",
  WEB_CMS_ENGINEER: "Web / CMS Engineer",
};

export const REQUIREMENTS_V2_ROLES = Object.values(ROLE_DISPLAY_NAMES);

@Injectable()
export class BamlRequirementsV2Extractor implements VacancyExtractor {
  async extract(text: string): Promise<ExtractionResult> {
    const collector = new Collector("vacancy-requirements-v2-extract");
    try {
      const data = await b.ExtractVacancyRequirementsV2(text, { collector });
      return {
        data: toEvalVacancy(data, text),
        meta: { promptVersion: REQUIREMENTS_V2_PROMPT_VERSION, usage: readUsage(collector) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      return {
        data: null,
        meta: {
          promptVersion: REQUIREMENTS_V2_PROMPT_VERSION,
          usage: readUsage(collector),
          error: `BAML Requirements v2 extraction: ${message}`,
        },
      };
    }
  }

  async identity(text: string): Promise<ExtractionIdentity> {
    const provider = "openai-generic";
    const model = process.env.DEEPSEEK_MODEL ?? "unknown";
    const taxonomyHash = sha256([...REQUIREMENTS_V2_ROLES].sort().join("\n"));
    return {
      specHash: sha256(
        [
          "ExtractVacancyRequirementsV2",
          String(REQUIREMENTS_V2_PROMPT_VERSION),
          BAML_REQUIREMENTS_V2_SOURCE_HASH,
          BAML_RUNTIME_VERSION,
          provider,
          model,
          taxonomyHash,
        ].join("|"),
      ),
      inputHash: sha256(text),
      provider,
      model,
      bamlVersion: BAML_RUNTIME_VERSION,
      bamlSourceHash: BAML_REQUIREMENTS_V2_SOURCE_HASH,
      taxonomyHash,
    };
  }
}

function toEvalVacancy(data: ExtractedVacancyRequirementsV2, text: string): ExtractedVacancy {
  const requirements = data.requirements.map((requirement) => ({
    priority: requirement.priority === RequirementPriority.MUST ? "must" : "nice",
    ...(requirement.value ? { value: requirement.value } : {}),
    ...(requirement.anyOf ? { anyOf: requirement.anyOf } : {}),
  }));
  return {
    ...data,
    // The browse contract cannot surface a technical vacancy without a role.
    // Keep the generic role as a deliberate, reviewable escape hatch rather
    // than letting a transient model omission make the vacancy invisible.
    role: data.role
      ? ROLE_DISPLAY_NAMES[data.role]
      : data.isTech
        ? ROLE_DISPLAY_NAMES.SOFTWARE_ENGINEER
        : null,
    seniority: advertisedSeniority(text),
    requirements,
  } as unknown as ExtractedVacancy;
}

/** Explicit advertised level is a source fact; do not let the model infer it from duties or years. */
function advertisedSeniority(text: string): Seniority | null {
  const header = text.slice(0, 500);
  const title = /^Title:\s*([^\n]*)/i.exec(header)?.[1] ?? "";
  const intro = header.slice(header.indexOf("\n") + 1);
  const matches = new Set<Seniority>();
  const roleNoun = "(?:engineer|developer|architect|administrator|analyst|scientist|specialist)";
  const levels: Array<[Seniority, RegExp, RegExp]> = [
    [
      Seniority.INTERN,
      /\b(?:intern|internship)\b/i,
      new RegExp(`\\b(?:intern|internship)\\b(?=.{0,30}${roleNoun})`, "i"),
    ],
    [
      Seniority.JUNIOR,
      /\b(?:junior|jr\.?)\b/i,
      new RegExp(`\\b(?:junior|jr[.]?)\\b(?=.{0,30}${roleNoun})`, "i"),
    ],
    [
      Seniority.MIDDLE,
      /\b(?:middle|mid-level)\b/i,
      new RegExp(`\\b(?:middle|mid-level)\\b(?=.{0,30}${roleNoun})`, "i"),
    ],
    [
      Seniority.SENIOR,
      /\b(?:senior|sr\.?)\b/i,
      new RegExp(`\\b(?:senior|sr[.]?)\\b(?=.{0,30}${roleNoun})`, "i"),
    ],
    [
      Seniority.LEAD,
      /\b(?:team lead|tech(?:nical)? lead|lead)\b/i,
      new RegExp(`\\b(?:team lead|tech(?:nical)? lead|lead)\\b(?=.{0,30}${roleNoun})`, "i"),
    ],
    [
      Seniority.PRINCIPAL,
      /\bprincipal\b/i,
      new RegExp(`\\bprincipal\\b(?=.{0,30}${roleNoun})`, "i"),
    ],
    [
      Seniority.C_LEVEL,
      /\b(?:cto|chief technology officer)\b/i,
      /\b(?:cto|chief technology officer)\b/i,
    ],
  ];
  for (const [level, titlePattern, introPattern] of levels) {
    if (titlePattern.test(title) || introPattern.test(intro)) matches.add(level);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

function readUsage(collector: Collector): ExtractionUsage {
  const usage = collector.usage;
  const call = collector.last?.calls?.[0];
  return {
    in: usage.inputTokens ?? 0,
    out: usage.outputTokens ?? 0,
    cached: usage.cachedInputTokens ?? 0,
    client: call?.clientName ?? "unknown",
    provider: call?.provider ?? "unknown",
    model: process.env.DEEPSEEK_MODEL ?? "unknown",
    ms: collector.last?.timing?.durationMs ?? null,
  };
}
