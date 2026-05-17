import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import { VacanciesService } from "./vacancies.service";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Controller("vacancies")
export class VacanciesController {
  constructor(private readonly vacancies: VacanciesService) {}

  @Get()
  list(
    @Query("q") q?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
    @Query("sourceId") rawSourceId?: string,
    @Query("roleId") rawRoleId?: string,
    @Query("skillIds") rawSkillIds?: string | string[],
    @Query("includeRoleless") rawIncludeRoleless?: string,
    @Query("includeAllSkills") rawIncludeAllSkills?: string,
  ) {
    const trimmed = q?.trim();
    const sourceId = rawSourceId?.trim();
    const roleId = rawRoleId?.trim();
    const skillIds = parseIdList(rawSkillIds);
    return this.vacancies.list({
      q: trimmed && trimmed.length > 0 ? trimmed : undefined,
      sourceId: sourceId && sourceId.length > 0 ? sourceId : undefined,
      roleId: roleId && roleId.length > 0 ? roleId : undefined,
      skillIds: skillIds.length > 0 ? skillIds : undefined,
      page: parsePage(rawPage),
      pageSize: parsePageSize(rawPageSize),
      includeRoleless: parseBool("includeRoleless", rawIncludeRoleless),
      includeAllSkills: parseBool("includeAllSkills", rawIncludeAllSkills),
    });
  }

  @Get("aggregates")
  aggregates() {
    return this.vacancies.getAggregates();
  }
}

function parsePage(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(
      `page must be a positive integer, got "${raw}"`,
    );
  }
  return n;
}

function parsePageSize(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
    throw new BadRequestException(
      `pageSize must be an integer in 1..${MAX_PAGE_SIZE}, got "${raw}"`,
    );
  }
  return n;
}

// The web fetcher serialises arrays as repeated params (?skillIds=a&skillIds=b),
// which Nest gives us as string[]; a single value arrives as a plain string.
function parseIdList(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((s) => s.trim()).filter((s) => s.length > 0);
}

function parseBool(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new BadRequestException(
    `${name} must be "true" or "false", got "${raw}"`,
  );
}
