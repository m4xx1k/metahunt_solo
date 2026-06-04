import { Injectable } from "@nestjs/common";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { VacancyLoaderService } from "../services/vacancy-loader.service";

@Injectable()
@Activity()
export class LoadVacancyActivity {
  constructor(private readonly loader: VacancyLoaderService) {}

  @ActivityMethod()
  async loadVacancy(rssRecordId: string): Promise<string> {
    return this.loader.loadFromRecord(rssRecordId);
  }
}
