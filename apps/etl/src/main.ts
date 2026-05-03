import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
// dist/main.js → repo root is three levels up; from src/main.ts at runtime
// `__dirname` is `apps/etl/dist/`, so `../../../.env` lands on the repo .env.
loadEnv({ path: resolve(__dirname, "../../../.env") });

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: "*" });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger("ETL").log(`HTTP server listening on http://localhost:${port}`);
}

bootstrap();
