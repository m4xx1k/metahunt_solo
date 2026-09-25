import { ApiProperty } from "@nestjs/swagger";

import { IsUUID } from "class-validator";

export class DetachVacancyDto {
  @ApiProperty({ description: "The member to split out of the group.", format: "uuid" })
  @IsUUID()
  vacancyId!: string;
}
