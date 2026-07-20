import { ApiProperty } from "@nestjs/swagger";

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    example: "invalid request",
  })
  message!: string | string[];

  @ApiProperty({ example: "Bad Request" })
  error!: string;
}

export class OkResponseDto {
  @ApiProperty({ example: true })
  ok!: true;
}
