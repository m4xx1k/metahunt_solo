// Best available name for a subscriber: @username (linked to Telegram) beats
// first_name beats a bare chat_id. tg_username/tg_first_name are nullable
// until the backfill reaches a given row — render whatever is present.
export function SubscriberIdentity({
  tgUsername,
  tgFirstName,
  chatId,
}: {
  tgUsername: string | null;
  tgFirstName: string | null;
  chatId: string;
}) {
  if (tgUsername) {
    return (
      <a
        href={`https://t.me/${tgUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:underline"
      >
        @{tgUsername}
      </a>
    );
  }
  return <span className="text-text-primary">{tgFirstName ?? chatId}</span>;
}
