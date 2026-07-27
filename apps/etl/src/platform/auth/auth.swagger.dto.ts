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

  @ApiProperty({ description: "First-ever login for this identity." })
  isNewUser!: boolean;
}

export class TelegramLoginStartResponseDto {
  @ApiProperty({ description: "Carried by the deep link. Not a credential on its own." })
  nonce!: string;

  @ApiProperty({ description: "Keep in the browser — required to collect the session." })
  pollSecret!: string;

  @ApiProperty({ example: "K7QM", description: "Show it; the bot echoes it for comparison." })
  verificationCode!: string;

  @ApiProperty({ example: "login_A1b2C3", description: "Append to t.me/<bot>?start=" })
  startPayload!: string;
}

export class TelegramLoginPollRequestDto {
  @ApiProperty()
  nonce!: string;

  @ApiProperty()
  pollSecret!: string;
}

export class TelegramLoginPollResponseDto {
  @ApiProperty({ enum: ["pending", "expired", "ready"] })
  status!: "pending" | "expired" | "ready";

  @ApiPropertyOptional({ description: "Present when status is ready." })
  token?: string;

  @ApiPropertyOptional({ type: AuthUserDto })
  user?: AuthUserDto;

  @ApiPropertyOptional()
  isNewUser?: boolean;
}
