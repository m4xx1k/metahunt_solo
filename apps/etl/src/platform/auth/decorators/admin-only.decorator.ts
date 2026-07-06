import { applyDecorators, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../jwt-auth.guard";
import { RolesGuard } from "../roles.guard";
import { Roles } from "./roles.decorator";

// Require an authenticated admin (a Telegram session JWT carrying the 'admin'
// role). Bundles JwtAuthGuard (authenticate) then RolesGuard (authorize) in the
// order RolesGuard depends on. The controller's module must import AuthModule.
export const AdminOnly = () =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles("admin"));
