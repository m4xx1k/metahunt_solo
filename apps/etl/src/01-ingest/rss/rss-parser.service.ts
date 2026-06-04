import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'crypto';
import { z } from 'zod';
import { isITVacancy } from './utils/vacancy-filter';

export const RawRssItem = z.object({
  title: z.string(),
  description: z.string().optional(),
  link: z.string().optional(),
  pubDate: z.string(),
  guid: z.union([z.string(), z.number()]).optional(),
  category: z.union([z.string(), z.array(z.string())]).optional(),
});
export type RawRssItem = z.infer<typeof RawRssItem>;

@Injectable()
export class RssParserService {
  // fast-xml-parser >=4.5 added a 1000-entity DoS cap; legitimate large RSS
  // feeds exceed it, so lift the cap (legacy parser had no such limit).
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: { enabled: true, maxTotalExpansions: Infinity },
  });

  parseXml(xml: string): RawRssItem[] {
    const parsed = this.parser.parse(xml);
    const items: unknown[] = parsed?.rss?.channel?.item ?? [];
    return items.flatMap((raw) => {
      const result = RawRssItem.safeParse(raw);
      return result.success ? [result.data] : [];
    });
  }

  filterItItems(items: RawRssItem[]): RawRssItem[] {
    return items.filter((item) => isITVacancy(item.title));
  }

  computeHash(item: RawRssItem): string {
    const publishedAt = new Date(item.pubDate).toISOString();
    return createHash('sha256')
      .update(item.title + (item.description ?? '') + publishedAt)
      .digest('hex');
  }
}
