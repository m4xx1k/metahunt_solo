import { Controller, Get, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "@metahunt/database";

@Controller()
export class AppController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @Get()
  async health(): Promise<{ status: string; db: string }> {
    await this.db.execute(sql`SELECT 1`);
    return { status: "ok", db: "up" };
  }
}
