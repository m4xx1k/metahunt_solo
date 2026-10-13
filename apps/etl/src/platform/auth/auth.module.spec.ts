import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { TemporalService } from "nestjs-temporal-core";

import { DatabaseModule, DRIZZLE } from "@metahunt/database";

import { TaxonomyModule } from "../../admin/taxonomy/taxonomy.module";

import { JwtAuthGuard } from "./jwt-auth.guard";

// The app registers Temporal globally; TaxonomyModule reaches it via DedupModule.
@Global()
@Module({ providers: [{ provide: TemporalService, useValue: {} }], exports: [TemporalService] })
class TemporalStubModule {}

describe("AuthModule consumer boundary", () => {
  it("resolves JwtAuthGuard in a module that imports AuthModule", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule.forRoot(),
        TemporalStubModule,
        TaxonomyModule,
      ],
    })
      .overrideProvider(DRIZZLE)
      .useValue({})
      .compile();

    expect(moduleRef.get(JwtAuthGuard, { strict: false })).toBeInstanceOf(JwtAuthGuard);
    await moduleRef.close();
  });
});
