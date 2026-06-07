import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import {
  SENIORITY_VALUES,
  WORK_FORMAT_VALUES,
  type Seniority,
  type WorkFormat,
} from "../../platform/shared/contract";
import { RankingService } from "../ranking/ranking.service";
import type { MatchResponse } from "../ranking/ranking.contract";
import { CandidateLoaderService } from "./candidate-loader.service";
import type { CandidateView, CvIngestResult } from "./cv.contract";
import { extractText } from "./text-extract";

@Controller("cv")
export class CvController {
  constructor(
    private readonly loader: CandidateLoaderService,
    private readonly ranking: RankingService,
  ) {}

  // Upload a CV as a file (field "file": PDF or .txt) OR as raw JSON {text}.
  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { text?: unknown } | undefined,
  ): Promise<CvIngestResult> {
    let text: string;
    if (file) {
      text = await extractText(file);
    } else if (typeof body?.text === "string" && body.text.trim().length > 0) {
      text = body.text;
    } else {
      throw new BadRequestException(
        "provide a file (field 'file') or a non-empty 'text'",
      );
    }
    return this.loader.loadFromText(text);
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<CandidateView> {
    return this.loader.getById(id);
  }

  // Rank all vacancies for a stored candidate.
  @Get(":id/matches")
  async matches(
    @Param("id") id: string,
    @Query("seniority") rawSeniority?: string,
    @Query("workFormat") rawWorkFormat?: string,
    @Query("sourceId") rawSourceId?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
  ): Promise<MatchResponse> {
    const refs = await this.loader.getMatchInput(id);
    return this.ranking.rankByRefs(
      refs,
      {
        seniority: parseEnum<Seniority>("seniority", rawSeniority, SENIORITY_VALUES),
        workFormat: parseEnum<WorkFormat>("workFormat", rawWorkFormat, WORK_FORMAT_VALUES),
        sourceId: parseId(rawSourceId),
      },
      parsePage(rawPage),
      parsePageSize(rawPageSize),
    );
  }
}

function parseEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly string[],
): T | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (!allowed.includes(trimmed)) {
    throw new BadRequestException(`${name} must be one of ${allowed.join(", ")}`);
  }
  return trimmed as T;
}

function parseId(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parsePage(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException("page must be a positive integer");
  }
  return n;
}

function parsePageSize(raw: string | undefined): number {
  if (raw === undefined) return 20;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new BadRequestException("pageSize must be an integer 1..100");
  }
  return n;
}
