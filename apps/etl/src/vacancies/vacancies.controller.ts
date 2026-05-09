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
    @Query("includeRoleless") rawIncludeRoleless?: string,
    @Query("includeAllSkills") rawIncludeAllSkills?: string,
  ) {
    const trimmed = q?.trim();
    return this.vacancies.list({
      q: trimmed && trimmed.length > 0 ? trimmed : undefined,
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

function parseBool(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new BadRequestException(
    `${name} must be "true" or "false", got "${raw}"`,
  );
}
