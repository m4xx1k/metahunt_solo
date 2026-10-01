import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { VacancyDto } from "../../03-discovery/feed/feed.contract";
import { FeedService, type FeedSearchParams } from "../../03-discovery/feed/feed.service";
import { uuidList } from "../../platform/shared/sql";

import { versionOf, type AlertCandidate } from "./decide";

const PAGE_SIZE = 100;

export interface AlertSubscription {
  id: string;
  params: Record<string, unknown>;
  alertsBumps: boolean;
}

export interface PostingCandidate extends AlertCandidate {
  seenAt: Date;
  /** The position's card with the posting's own id, link and source. */
  card: VacancyDto;
  subscriptionIds: string[];
}

type MemberRow = {
  id: string;
  position_id: string;
  source_id: string;
  source_code: string;
  source_display_name: string;
  external_id: string;
  rss_record_id: string;
  link: string | null;
  published_at: Date | null;
  loaded_at: Date;
  observed_at: Date;
};

// Filter → FeedService (the one filter implementation) with a posting-level
// window → the member postings of every matched position inside that window.
@Injectable()
export class AlertCandidatesRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly feed: FeedService,
  ) {}

  /** Candidates for one chat, merged across its subscriptions, oldest activity first. */
  async forChat(
    subscriptions: { subscription: AlertSubscription; since: Date }[],
  ): Promise<PostingCandidate[]> {
    const byPosting = new Map<string, PostingCandidate>();
    for (const { subscription, since } of subscriptions) {
      for (const candidate of await this.forSubscription(subscription, since)) {
        const known = byPosting.get(candidate.vacancyId);
        if (known) known.subscriptionIds.push(subscription.id);
        else byPosting.set(candidate.vacancyId, candidate);
      }
    }
    return [...byPosting.values()].sort(
      (a, b) => a.seenAt.getTime() - b.seenAt.getTime() || a.vacancyId.localeCompare(b.vacancyId),
    );
  }

  private async forSubscription(
    subscription: AlertSubscription,
    since: Date,
  ): Promise<PostingCandidate[]> {
    const params = subscription.params as Partial<FeedSearchParams>;
    const positions = await this.matchingPositions(params, since);
    if (positions.size === 0) return [];

    const sourceFilter = params.sourceId ? sql`AND v.source_id = ${params.sourceId}::uuid` : sql``;
    const members = await this.db.execute<MemberRow>(sql`
      SELECT v.id, v.unique_vacancy_id AS position_id, v.source_id, v.external_id,
             s.code AS source_code, s.display_name AS source_display_name,
             r.id AS rss_record_id, r.link, v.published_at, v.loaded_at,
             r.created_at AS observed_at
      FROM vacancies v
      JOIN sources s ON s.id = v.source_id
      JOIN rss_records r ON r.id = v.last_rss_record_id
      WHERE v.unique_vacancy_id IN (${uuidList([...positions.keys()])})
        AND v.deduplicated_at IS NOT NULL
        AND greatest(v.published_at, v.loaded_at) > ${since}
        ${sourceFilter}
    `);

    return members.rows.flatMap((m) => {
      const position = positions.get(m.position_id);
      if (!position) return [];
      const publishedAt = m.published_at ? new Date(m.published_at) : null;
      const loadedAt = new Date(m.loaded_at);
      return [
        {
          vacancyId: m.id,
          positionId: m.position_id,
          sourceId: m.source_id,
          versionAt: versionOf(publishedAt, loadedAt, new Date(m.observed_at)),
          seenAt: publishedAt && publishedAt > loadedAt ? publishedAt : loadedAt,
          card: {
            ...position,
            id: m.id,
            externalId: m.external_id,
            rssRecordId: m.rss_record_id,
            link: m.link,
            source: { id: m.source_id, code: m.source_code, displayName: m.source_display_name },
            publishedAt: publishedAt ? publishedAt.toISOString() : null,
          },
          subscriptionIds: [subscription.id],
        },
      ];
    });
  }

  // Every page, no cap: the alert promise is "everything that matches arrives".
  private async matchingPositions(
    params: Partial<FeedSearchParams>,
    since: Date,
  ): Promise<Map<string, VacancyDto>> {
    const out = new Map<string, VacancyDto>();
    for (let page = 1; ; page++) {
      const res = await this.feed.search({
        ...params,
        page,
        pageSize: PAGE_SIZE,
        postingActiveAfter: since,
      });
      for (const item of res.items) {
        if (item.uniqueVacancyId) out.set(item.uniqueVacancyId, item);
      }
      if (res.items.length < PAGE_SIZE || page * PAGE_SIZE >= res.total) return out;
    }
  }
}
