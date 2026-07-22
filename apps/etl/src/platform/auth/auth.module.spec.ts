import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { DatabaseModule, DRIZZLE } from "@metahunt/database";

import { TaxonomyModule } from "../../admin/taxonomy/taxonomy.module";

import { JwtAuthGuard } from "./jwt-auth.guard";

describe("AuthModule consumer boundary", () => {
  it("resolves JwtAuthGuard in a module that imports AuthModule", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule.forRoot(),
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
