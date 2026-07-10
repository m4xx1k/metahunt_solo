import { Inject, Injectable } from "@nestjs/common";

import { and, eq, gt } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

const { sentNotifications, vacancies } = schema;

/**
 * Persistence for the "already sent" ledger. The composite PK
 * (subscription_id, vacancy_id) makes a double-send impossible even under
 * retry; the anti-join this table feeds — not a stored watermark — is what
 * makes digest matching correct (see migration tracker #decisions).
 */
@Injectable()
export class SentNotificationsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Vacancy ids already sent for this subscription among vacancies loaded after
   * `loadedAfter` — i.e. the ones that could still be candidates this run.
   * Bounded by the scan window so the exclusion list stays small.
   */
  async sentVacancyIds(subscriptionId: string, loadedAfter: Date): Promise<string[]> {
    const rows = await this.db
      .select({ vacancyId: sentNotifications.vacancyId })
      .from(sentNotifications)
      .innerJoin(vacancies, eq(vacancies.id, sentNotifications.vacancyId))
      .where(
        and(
          eq(sentNotifications.subscriptionId, subscriptionId),
          gt(vacancies.loadedAt, loadedAfter),
        ),
      );
    return rows.map((r) => r.vacancyId);
  }

  /** Record a sent page. Idempotent — the PK collision is ignored on retry. */
  async record(subscriptionId: string, vacancyIds: string[]): Promise<void> {
    if (vacancyIds.length === 0) return;
    await this.db
      .insert(sentNotifications)
      .values(vacancyIds.map((vacancyId) => ({ subscriptionId, vacancyId })))
      .onConflictDoNothing();
  }
}
