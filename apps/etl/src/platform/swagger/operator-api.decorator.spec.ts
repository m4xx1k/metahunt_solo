import { GUARDS_METADATA } from "@nestjs/common/constants";

import { DedupController } from "../../02-enrich/dedup/dedup.controller";
import { ExtractionCostController } from "../../02-enrich/extraction-cost/extraction-cost.controller";
import { LoaderController } from "../../02-enrich/loader/loader.controller";
import { DigestController } from "../../04-notify/telegram/digest.controller";
import { RssController } from "../../01-ingest/rss/rss.controller";
import { MonitoringController } from "../../admin/monitoring/monitoring.controller";
import { TaxonomyController } from "../../admin/taxonomy/taxonomy.controller";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";

const OPERATOR_CONTROLLERS = [
  RssController,
  LoaderController,
  DigestController,
  DedupController,
  ExtractionCostController,
  MonitoringController,
  TaxonomyController,
];

describe("OperatorApi", () => {
  it.each(OPERATOR_CONTROLLERS)("requires an authenticated admin on %p", (controller) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard]),
    );
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(["admin"]);
  });
});
