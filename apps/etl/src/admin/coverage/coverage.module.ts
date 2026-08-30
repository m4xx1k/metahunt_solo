import { Module } from "@nestjs/common";

import { AuthModule } from "../../platform/auth/auth.module";

import { CoverageController } from "./coverage.controller";
import { CoverageService } from "./coverage.service";

@Module({
  imports: [AuthModule], // provides JwtAuthGuard + RolesGuard for @OperatorApi
  providers: [CoverageService],
  controllers: [CoverageController],
})
export class CoverageModule {}
