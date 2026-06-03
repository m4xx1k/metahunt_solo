import { Module } from "@nestjs/common";

import { VacanciesController } from "./vacancies.controller";
import { VacanciesService } from "./vacancies.service";
import { AggregatesService } from "./aggregates.service";

@Module({
  providers: [VacanciesService, AggregatesService],
  controllers: [VacanciesController],
})
export class VacanciesModule {}
