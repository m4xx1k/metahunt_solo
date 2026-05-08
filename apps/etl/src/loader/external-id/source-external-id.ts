import { djinniExtractor } from "./extractors/djinni";
import { douExtractor } from "./extractors/dou";

export type RssIdInputs = { guid?: string; link?: string };
export type ExternalIdExtractor = (item: RssIdInputs) => string;

const EXTRACTORS: Record<string, ExternalIdExtractor> = {
  djinni: djinniExtractor,
  dou: douExtractor,
};

export function extractExternalId(
  sourceCode: string,
  item: RssIdInputs,
): string {
  const fn = EXTRACTORS[sourceCode];
  if (!fn) {
    throw new Error(`No external_id extractor for source '${sourceCode}'`);
  }
  const id = fn(item);
  if (!id) {
    throw new Error(
      `Empty external_id derived for source '${sourceCode}' from ${JSON.stringify(item)}`,
    );
  }
  return id;
}
