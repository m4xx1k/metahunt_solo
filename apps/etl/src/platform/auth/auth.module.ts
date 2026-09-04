import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { AnalyticsModule } from "../analytics/analytics.module";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OptionalAuthGuard } from "./optional-auth.guard";
import { RolesGuard } from "./roles.guard";
import { TelegramLoginGc } from "./telegram-login.gc";
import { TelegramLoginService } from "./telegram-login.service";

// Consumer auth: provider identity → own session JWT + role guards. ConfigService
// is global (ConfigModule.isGlobal), so JwtModule reads JWT_SECRET directly.
@Module({
  imports: [
    AnalyticsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "30d" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TelegramLoginService,
    TelegramLoginGc,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
  ],
  // Guards declared on controllers are resolved in the consuming module's DI
  // context. Export AuthService with them so JwtAuthGuard's account-existence
  // recheck remains resolvable outside AuthModule (for example TaxonomyModule).
  exports: [
    AuthService,
    TelegramLoginService,
    JwtAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    JwtModule,
  ],
})
export class AuthModule {}
