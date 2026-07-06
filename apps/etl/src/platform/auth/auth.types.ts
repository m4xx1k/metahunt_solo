// What a verified session JWT resolves to, attached as `request.user` by
// JwtAuthGuard and read by RolesGuard / @CurrentUser.
export interface JwtUser {
  userId: string;
  telegramId: string | null;
  roles: string[];
}

// The signed JWT payload. `sub` = user id, `tid` = telegram id.
export interface JwtPayload {
  sub: string;
  tid: string | null;
  roles: string[];
}

// Minimal request shape the guards touch — avoids depending on @types/express
// (not a direct dep here). Nest attaches `user` for us.
export interface RequestWithUser {
  headers: { authorization?: string };
  user?: JwtUser;
}
