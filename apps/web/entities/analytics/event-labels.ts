// Human names for the first-party journey events. Shared by the overview
// widget and the Analytics screen so one funnel step never gets two names.
const EVENT_LABELS: Record<string, string> = {
  landing_view: "landing view",
  landing_cta_clicked: "cta click",
  subscription_create_started: "sub started",
  subscription_created: "sub created",
  subscription_handoff_opened: "telegram opened",
  telegram_linked: "telegram linked",
  activation_value_shown: "first jobs shown",
  digest_sent: "digest sent",
  digest_link_clicked: "digest click",
};

export function eventLabel(name: string): string {
  return EVENT_LABELS[name] ?? name.replace(/_/g, " ");
}
