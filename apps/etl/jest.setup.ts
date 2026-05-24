process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-openai-key";

import { Logger, ConsoleLogger } from "@nestjs/common";
const noop = (): void => {};
const proto = Logger.prototype as unknown as Record<string, unknown>;
const consoleProto = ConsoleLogger.prototype as unknown as Record<string, unknown>;
for (const level of ["log", "error", "warn", "debug", "verbose", "fatal"]) {
  proto[level] = noop;
  consoleProto[level] = noop;
}
Logger.overrideLogger(false);
