// Single source for all Telegram-facing UA copy: bot replies, digest prose, and
// subscription labels. Values are plain strings or param functions — no Nest
// deps, so it imports cleanly into the handler, renderer, and services. Keyed so
// a future i18n layer is a per-locale swap of this object with no call-site
// churn. YAGNI: no locale machinery now.

/** Native command menu (`setMyCommands`) AND the `/help` body — one source, no drift. */
export const BOT_COMMANDS = [
  { command: "list", description: "Мої підписки" },
  { command: "preview", description: "Приклад дайджесту" },
  { command: "stop", description: "Вимкнути сповіщення" },
  { command: "help", description: "Довідка" },
] as const;

const stripScheme = (url: string): string => url.replace(/^https?:\/\//, "");
const siteCta = (webUrl: string): string => `Створи на сайті: ${webUrl}`;

export const copy = {
  start: {
    greeting: (webUrl: string): string =>
      `👋 Привіт! Це <b>metahunt</b> — агрегатор IT-вакансій.\n` +
      `🔗 <a href="${webUrl}">${stripScheme(webUrl)}</a>\n\n` +
      `Підписки створюються на сайті: обираєш фільтр і тиснеш ` +
      `«Підписатись» — далі я надсилатиму нові вакансії сюди.`,
    linked: "✅ Підписку активовано. Надсилатиму нові вакансії за твоїм фільтром.",
    alreadyActive: "ℹ️ Ця підписка вже активна — нічого робити не треба.",
    duplicate: "ℹ️ Ти вже підписаний на цей фільтр — нову підписку не створював.",
    invalidToken: (webUrl: string): string =>
      `⚠️ Це посилання недійсне або застаріле. ${siteCta(webUrl)}`,
  },
  list: {
    empty: (webUrl: string): string => `У тебе немає активних підписок. ${siteCta(webUrl)}`,
    item: (label: string): string => `🔔 ${label}`,
    unsubButton: "❌ Відписатись",
  },
  preview: {
    empty: (webUrl: string): string => `У тебе немає активних підписок. ${siteCta(webUrl)}`,
  },
  unsub: {
    done: "Відписано",
    notFound: "Підписку не знайдено",
    confirmed: "❌ Відписано.",
  },
  stop: {
    done: "🛑 Сповіщення вимкнено.",
    empty: "У тебе немає активних підписок.",
  },
  help: (): string =>
    "Команди:\n" + BOT_COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n"),
  // Reply to any free-text / unknown command — the bot is link-driven, so nudge
  // back to /help and the site rather than staying silent (reads as broken).
  fallback: (webUrl: string): string =>
    `Я розумію лише команди — почни з /help. ` + `Підписки створюються на сайті: ${webUrl}`,
  // Shown to the user when a handler throws, so a failure isn't silent.
  error: "⚠️ Щось пішло не так. Спробуй ще раз трохи згодом.",
  digest: {
    header: (count: number, window: string, filter: string, pager: string): string =>
      `⌖ <b>${count}</b> нових${window}${filter}${pager}`,
    window: (days: number): string => ` за ${days} дн`,
    reservation: "🪖 <b>бронь</b>",
    noTest: "🧪 <b>без тесту</b>",
    hasTest: "🧪 <b>тестове</b>",
  },
  describe: {
    byCv: "за резюме",
    skills: (n: number): string => `${n} скіл.`,
    reservation: "бронь",
    experience: (years: string[]): string => `досвід ${years.join("/")}р`,
    all: "усі вакансії",
  },
} as const;
