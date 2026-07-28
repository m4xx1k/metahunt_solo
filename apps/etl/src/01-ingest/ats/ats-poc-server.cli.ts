// SPIKE — MET-54. Serves ONLY the ATS endpoint the /ats page needs.
//
// Deliberately not `pnpm dev:etl`: the real AppModule boots the Telegram bot
// and a Temporal worker. Starting the bot with the production token would make
// this process compete with live prod for updates — an outward-facing side
// effect a local preview must never have.

import { join } from "path";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { DatabaseModule } from "@metahunt/database";

import { AtsBoardsController } from "../../03-discovery/feed/ats-boards.controller";

const REPO_ROOT = join(__dirname, "../../../../..");
const PORT = Number(process.env.ATS_POC_PORT ?? 3399);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [join(REPO_ROOT, ".env")] }),
    DatabaseModule.forRoot(),
  ],
  controllers: [AtsBoardsController],
})
class AtsPocServerModule {}

async function main(): Promise<void> {
  const app = await NestFactory.create(AtsPocServerModule, { logger: ["warn", "error"] });
  app.enableCors({ origin: true });
  await app.listen(PORT);
  process.stdout.write(`ats poc api on http://localhost:${PORT}/ats/companies\n`);
}

void main();
