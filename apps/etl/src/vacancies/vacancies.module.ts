import { Module } from "@nestjs/common";

import { VacanciesController } from "./vacancies.controller";
import { VacanciesService } from "./vacancies.service";

@Module({
  providers: [VacanciesService],
  controllers: [VacanciesController],
})
export class VacanciesModule {}
