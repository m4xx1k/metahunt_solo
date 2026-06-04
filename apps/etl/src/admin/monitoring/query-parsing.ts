import { BadRequestException } from "@nestjs/common";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLimit(
  raw: string | undefined,
  defaultValue = 50,
  max = 200,
): number {
  if (raw === undefined) return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new BadRequestException(
      `limit must be an integer in 1..${max}, got "${raw}"`,
    );
  }
  return n;
}

export function parseOffset(
  raw: string | undefined,
  defaultValue = 0,
): number {
  if (raw === undefined) return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException(
      `offset must be a non-negative integer, got "${raw}"`,
    );
  }
  return n;
}

export function parseUuid(
  name: string,
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (!UUID_RE.test(raw)) {
    throw new BadRequestException(`${name} must be a UUID, got "${raw}"`);
  }
  return raw;
}

export function parseRequiredUuid(name: string, raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw new BadRequestException(`${name} must be a UUID, got "${raw}"`);
  }
  return raw;
}

export function parseEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (raw === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new BadRequestException(
      `${name} must be one of ${allowed.join("|")}, got "${raw}"`,
    );
  }
  return raw as T;
}

export function parseIso(
  name: string,
  raw: string | undefined,
): Date | undefined {
  if (raw === undefined) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(
      `${name} must be an ISO timestamp, got "${raw}"`,
    );
  }
  return d;
}

export function parseBool(
  name: string,
  raw: string | undefined,
): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new BadRequestException(
    `${name} must be "true" or "false", got "${raw}"`,
  );
}
