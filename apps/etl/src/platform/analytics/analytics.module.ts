import { Global, Module } from "@nestjs/common";

import { SUBSCRIBER_IDENTITY_READER } from "./analytics.ports";
import { AnalyticsService } from "./analytics.service";
import { PostHogClient } from "./posthog.client";
import { SubscriberIdentityStore } from "./subscriber-identity.store";

// Global so any feature service can inject without re-importing (mirrors
// DatabaseModule). PostHogClient is the only thing in the process that holds a
// PostHog SDK instance, and since the Postgres ledger retired it is also the
// only writer of an analytics fact anywhere — one store, one author.
@Global()
@Module({
  providers: [
    AnalyticsService,
    PostHogClient,
    SubscriberIdentityStore,
    { provide: SUBSCRIBER_IDENTITY_READER, useExisting: SubscriberIdentityStore },
  ],
  exports: [AnalyticsService, PostHogClient, SUBSCRIBER_IDENTITY_READER],
})
export class AnalyticsModule {}
