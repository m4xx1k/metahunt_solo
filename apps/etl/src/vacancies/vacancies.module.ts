import { Module } from "@nestjs/common";

import { VacanciesController } from "./vacancies.controller";
import { VacanciesService } from "./vacancies.service";
import { FacetsService } from "./facets.service";

@Module({
  providers: [VacanciesService, FacetsService],
  controllers: [VacanciesController],
})
export class VacanciesModule {}
