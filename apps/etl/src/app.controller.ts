import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { sql } from "drizzle-orm";

import { DRIZZLE, type DrizzleDB } from "@metahunt/database";

@Controller()
@ApiTags("system")
export class AppController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Get()
  @ApiOperation({ summary: "Check API process and database connectivity" })
  @ApiOkResponse({ description: "Process is up and the database accepted SELECT 1." })
  async health(): Promise<{ status: string; db: string }> {
    await this.db.execute(sql`SELECT 1`);
    return { status: "ok", db: "up" };
  }
}
