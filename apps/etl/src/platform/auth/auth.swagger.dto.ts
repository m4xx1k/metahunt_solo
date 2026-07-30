import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class GoogleLoginRequestDto {
  @ApiProperty({ description: "The ID token Google Identity Services returns." })
  credential!: string;
}

export class AuthIdentityDto {
  @ApiProperty({ enum: ["telegram", "google"] })
  provider!: "telegram" | "google";

  @ApiProperty({ nullable: true, example: "metahunt_user" })
  username!: string | null;

  @ApiProperty({ nullable: true, example: "Maksym" })
  firstName!: string | null;

  @ApiProperty({ format: "date-time" })
  linkedAt!: string;
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

  @ApiProperty({ nullable: true, format: "email" })
  email!: string | null;

  @ApiProperty({ type: [String], example: ["user"] })
  roles!: string[];

  @ApiProperty({ type: [AuthIdentityDto] })
  identities!: AuthIdentityDto[];
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
  @ApiProperty({ enum: ["pending", "expired", "conflict", "ready"] })
  status!: "pending" | "expired" | "conflict" | "ready";

  @ApiPropertyOptional({ description: "Present when status is ready." })
  token?: string;

  @ApiPropertyOptional({ type: AuthUserDto })
  user?: AuthUserDto;

  @ApiPropertyOptional()
  isNewUser?: boolean;
}
