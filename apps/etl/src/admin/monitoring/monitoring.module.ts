import { Module } from "@nestjs/common";

import { AuthModule } from "../../platform/auth/auth.module";

import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";

@Module({
  imports: [AuthModule],
  providers: [MonitoringService],
  controllers: [MonitoringController],
})
export class MonitoringModule {}
