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
import { b, RequirementPriority } from "../baml_client";
import type {
  ExtractedVacancy,
  ExtractedVacancyRequirementsV2,
  RequirementsV2Role,
} from "../baml_client";

/** Eval-only prompt; production continues to use ExtractVacancy unchanged. */
export const REQUIREMENTS_V2_PROMPT_VERSION = 2;
export const BAML_REQUIREMENTS_V2_SOURCE_HASH =
  "b75ab120c97a104a13985cd9e0744e29ba49e324b7f50a0f061b507b713d19b3";

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
        data: toEvalVacancy(data),
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

function toEvalVacancy(data: ExtractedVacancyRequirementsV2): ExtractedVacancy {
  const requirements = data.requirements.map((requirement) => ({
    priority: requirement.priority === RequirementPriority.MUST ? "must" : "nice",
    ...(requirement.value ? { value: requirement.value } : {}),
    ...(requirement.anyOf ? { anyOf: requirement.anyOf } : {}),
  }));
  return {
    ...data,
    role: data.role ? ROLE_DISPLAY_NAMES[data.role] : null,
    requirements,
  } as unknown as ExtractedVacancy;
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
