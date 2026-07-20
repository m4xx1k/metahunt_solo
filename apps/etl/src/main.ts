import "reflect-metadata";
// eslint-disable-next-line import/order -- env must load before the AppModule import below
import { config as loadEnv } from "dotenv";

import { resolve } from "node:path";
// dist/main.js → repo root is three levels up; from src/main.ts at runtime
// `__dirname` is `apps/etl/dist/`, so `../../../.env` lands on the repo .env.
loadEnv({ path: resolve(__dirname, "../../../.env") });

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: "*" });
  // Behind Railway's proxy, honor X-Forwarded-For so req.ip is the real client
  // IP — otherwise the rate limiter buckets every user under the proxy's IP
  // (and the strict /cv 5/min would apply globally). One hop = the platform edge.
  const httpInstance = app.getHttpAdapter().getInstance() as {
    set(setting: string, value: unknown): void;
  };
  httpInstance.set("trust proxy", 1);

  // API docs are a local/staging engineering surface. Production exposes neither
  // Swagger UI nor the generated OpenAPI JSON; protected operator endpoints are
  // documented with their Bearer requirement when docs are enabled.
  if (process.env.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("MetaHunt API")
      .setDescription("Public product API and authenticated operator API.")
      .setVersion("1.0.0")
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, swaggerDocument, {
      jsonDocumentUrl: "docs/openapi.json",
    });
    new Logger("ETL").log("Swagger docs available at /docs outside production");
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger("ETL").log(`HTTP server listening on http://localhost:${port}`);
}

void bootstrap();
