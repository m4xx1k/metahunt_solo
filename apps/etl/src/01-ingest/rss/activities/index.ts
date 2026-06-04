import { RssExtractActivity } from "./rss-extract.activity";
import { RssFetchActivity } from "./rss-fetch.activity";
import { RssFinalizeActivity } from "./rss-finalize.activity";
import { RssListSourcesActivity } from "./rss-list-sources.activity";
import { RssParseActivity } from "./rss-parse.activity";

export {
  RssExtractActivity,
  RssFetchActivity,
  RssFinalizeActivity,
  RssListSourcesActivity,
  RssParseActivity,
};

// Single source of truth for the activity classes wired into both:
//   - the Temporal worker (registered as `activityClasses`)
//   - the RSS Nest module (registered as `providers` so DI can resolve them)
// Keep these aligned by referencing this constant from both call sites.
export const RSS_ACTIVITIES = [
  RssFetchActivity,
  RssParseActivity,
  RssExtractActivity,
  RssFinalizeActivity,
  RssListSourcesActivity,
] as const;
