import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CandidateLoaderService } from "./candidate-loader.service";
import type { CandidateView, CvIngestResult } from "./cv.contract";
import { extractText } from "./text-extract";

@Controller("cv")
export class CvController {
  constructor(private readonly loader: CandidateLoaderService) {}

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
}
