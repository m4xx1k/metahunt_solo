import { Module } from "@nestjs/common";

import { VacanciesController } from "./vacancies.controller";
import { VacanciesService } from "./vacancies.service";
import { TracksRepository } from "./tracks.repository";

@Module({
  providers: [VacanciesService, TracksRepository],
  controllers: [VacanciesController],
})
export class VacanciesModule {}
