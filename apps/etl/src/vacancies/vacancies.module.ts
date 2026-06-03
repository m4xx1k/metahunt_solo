import { Module } from "@nestjs/common";

import { VacanciesController } from "./vacancies.controller";
import { VacanciesService } from "./vacancies.service";
import { AggregatesService } from "./aggregates.service";
import { TracksService } from "./tracks.service";
import { TracksRepository } from "./tracks.repository";

@Module({
  providers: [
    VacanciesService,
    AggregatesService,
    TracksService,
    TracksRepository,
  ],
  controllers: [VacanciesController],
})
export class VacanciesModule {}
