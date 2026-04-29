import { readFileSync } from 'fs';
import { join } from 'path';
import { RssParserService } from './rss-parser.service';

const svc = new RssParserService();

describe('RssParserService', () => {
  it('parses djinni XML and filters IT items', () => {
    const xml = readFileSync(
      join(__dirname, '../../data/rss/djinni-rss.xml'),
      'utf-8',
    );
    const all = svc.parseXml(xml);
    const it = svc.filterItItems(all);
    console.log(`Djinni — total: ${all.length}, IT: ${it.length}`);
    expect(all.length).toBeGreaterThan(0);
    expect(it.length).toBeGreaterThan(0);
  });

  it('parses DOU XML and filters IT items', () => {
    const xml = readFileSync(
      join(__dirname, '../../data/rss/dou-rss.xml'),
      'utf-8',
    );
    const all = svc.parseXml(xml);
    const it = svc.filterItItems(all);
    console.log(`DOU — total: ${all.length}, IT: ${it.length}`);
    expect(all.length).toBeGreaterThan(0);
  });

  it('computes stable hash', () => {
    const xml = readFileSync(
      join(__dirname, '../../data/rss/djinni-rss.xml'),
      'utf-8',
    );
    const [item] = svc.parseXml(xml);
    const h1 = svc.computeHash(item);
    const h2 = svc.computeHash(item);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});
