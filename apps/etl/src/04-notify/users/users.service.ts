import { Inject, Injectable } from "@nestjs/common";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type {
  SignupSource,
  SubscribeResponse,
} from "./users.contract";

const { users } = schema;

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Idempotent waitlist signup. Insert with ON CONFLICT DO NOTHING so a
   * concurrent retry never produces a 5xx, and so we can distinguish a
   * first-time signup from a repeat one by the size of `returning`.
   */
  async subscribe(
    rawEmail: string,
    source: SignupSource,
  ): Promise<SubscribeResponse> {
    const email = rawEmail.trim().toLowerCase();
    const inserted = await this.db
      .insert(users)
      .values({ email, source })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    return {
      status: inserted.length > 0 ? "subscribed" : "already_subscribed",
    };
  }
}
