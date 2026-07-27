import { lastActionEventLabels } from "@/entities/analytics/event-catalog";
import { InfoHint } from "@/ui/overlay/InfoHint";

// The roster's "last action" column is only as complete as the ledger, and the
// ledger is missing every browser-only event. Listing the qualifying events
// from the catalog keeps that limit visible instead of implying full coverage.
export function LastActionHint() {
  return (
    <InfoHint label="what last action means">
      The newest thing the subscriber did themselves — digests we send never count. Currently:{" "}
      {lastActionEventLabels().join(", ")}. CV uploads and logins fire too, but never reach the
      ledger, so they cannot show here.
    </InfoHint>
  );
}
