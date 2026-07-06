import { SetMetadata } from "@nestjs/common";

// Require one of the listed roles on a route/controller. Enforced by RolesGuard,
// which must sit after JwtAuthGuard in @UseGuards(JwtAuthGuard, RolesGuard).
export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
