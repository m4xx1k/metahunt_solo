import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TelegramWidgetPayloadDto {
  @ApiProperty({ example: 123456789 })
  id!: number;

  @ApiProperty({ example: 1760000000, description: "Unix timestamp from Telegram." })
  auth_date!: number;

  @ApiProperty({ description: "Telegram login-widget HMAC signature." })
  hash!: string;

  @ApiPropertyOptional({ example: "metahunt_user" })
  username?: string;

  @ApiPropertyOptional({ example: "Maksym" })
  first_name?: string;

  @ApiPropertyOptional({ example: "User" })
  last_name?: string;

  @ApiPropertyOptional({ format: "uri" })
  photo_url?: string;
}

export class TelegramLoginRequestDto {
  @ApiProperty({ type: TelegramWidgetPayloadDto })
  telegram!: TelegramWidgetPayloadDto;
}

export class AuthUserDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ nullable: true, example: "123456789" })
  telegramId!: string | null;

  @ApiProperty({ nullable: true, example: "metahunt_user" })
  username!: string | null;

  @ApiProperty({ nullable: true, example: "Maksym" })
  firstName!: string | null;

  @ApiProperty({ type: [String], example: ["user"] })
  roles!: string[];
}

export class TelegramLoginResponseDto {
  @ApiProperty({ description: "Use as Authorization: Bearer <token>." })
  token!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
