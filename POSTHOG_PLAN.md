# PostHog — план імплементації (backend + frontend) + identity-модель

Чернетка плану. Код-реальність, на яку спираюсь:
- web → `apps/web/app/(feed)/_components/subscribe/SubscribeButton.tsx` створює підписку і веде в Telegram.
- backend `subscriptions.id` (uuid) = і ідентифікатор підписки, і deep-link токен (`?start=<id>`).
- `chatId` з'являється лише на `/start` (`subscriptions.service.ts:linkChat`).
- доставка дайджесту → `digest.service.ts:deliver`.
- apply-клік проходить через `/go/:id` (`feed/redirect.controller.ts`) — там уже стоїть `TODO(tracking)`.
- авторизації як такої нема: `users` — це лише waitlist-email; на фронті обгортка `ClerkProvider` присутня, але публічний фід анонімний.

---

## 0. TL;DR — головна теза

`subscription_uuid` — це **єдиний наскрізний ключ**, який живе у всіх трьох світах:

1. народжується на **web** при створенні підписки (web його бачить у відповіді POST);
2. їде в **Telegram** як `/start <uuid>` токен (бот його бачить);
3. є **PK** рядка підписки (backend його бачить завжди).

Тому весь identity-stitching будуємо навколо нього. `chat_id` і майбутній `user_id` (email/OAuth) — це **alias-и, які навішуються на той самий person-граф через `subscription_uuid`**. Коли прийде реальна авторизація — нічого в схемі склейки переписувати не треба, лише додається ще один `alias`.

```
анонімний браузер ──alias──▶ subscription_uuid ──alias──▶ tg:chat_id
   (cookie distinct_id)            │                          │
                                   └────────── (пізніше) ──────┴──alias──▶ user_id (email/OAuth)
                            усе зливається в ОДНУ людину в PostHog
```

---

## 1. Архітектура

**Backend (`apps/etl`)** — глобальний `AnalyticsModule` + `AnalyticsService` як єдине місце, що знає про `posthog-node`. Решта сервісів викликає доменні методи (`subscriptionCreated`, `telegramLinked`, `digestSent`, `applyClicked`, `unsubscribed`) — ніхто більше не імпортує posthog. Дзеркалить наявний патерн «один сервіс володіє зовнішнім SDK» (як `TelegramService` володіє grammy).

**Frontend (`apps/web`)** — `posthog-js` у `PostHogProvider` (client component) в `app/layout.tsx`, поруч із наявним `VercelAnalytics`. Autocapture pageview-ів + ручний `capture`/`alias` у момент підписки.

**Dormant-патерн.** Точно як `TELEGRAM_BOT_TOKEN`: порожній ключ → сервіс no-op, без падіння. Так `local`/`test`/CI не шлють подій.

---

## 2. Backend — кроки

### 2.1 ENV
Додати у `platform/config/env.validation.ts` (за зразком `telegramBotToken`/`publicBaseUrl`):
```ts
const posthogApiKey = asString(config.POSTHOG_API_KEY) ?? "";        // порожній → no-op
const posthogHost   = asString(config.POSTHOG_HOST) ?? "https://eu.posthog.com";
// ...повернути у return { ... POSTHOG_API_KEY, POSTHOG_HOST }
```
> Проект ЄС-орієнтований (Київ) → беремо `eu.posthog.com` (резиденція даних в ЄС).

### 2.2 Модуль + сервіс
`apps/etl/src/platform/analytics/analytics.module.ts` (платформенний шар, як `config`/`health`):
```ts
@Global()
@Module({ providers: [AnalyticsService], exports: [AnalyticsService] })
export class AnalyticsModule {}
```

`analytics.service.ts` — єдине місце з PostHog:
```ts
@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly client?: PostHog;
  private readonly log = new Logger(AnalyticsService.name);

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>("POSTHOG_API_KEY");
    if (!key) { this.log.warn("PostHog dormant (no POSTHOG_API_KEY)"); return; }
    this.client = new PostHog(key, {
      host: this.config.get<string>("POSTHOG_HOST"),
      flushAt: 1, flushInterval: 0,   // сервер живе довго → шлемо одразу, не копимо
    });
  }

  // ── доменні методи (єдиний публічний контракт) ───────────────────
  subscriptionCreated(uuid: string, params: unknown) {
    this.capture(uuid, "subscription_created", { params });
  }
  telegramLinked(uuid: string, chatId: string, result: string) {
    // 1) зливаємо person(uuid) ⇄ person(tg:chatId)
    this.client?.alias({ distinctId: uuid, alias: `tg:${chatId}` });
    // 2) сама подія — на канонічному людському id
    this.capture(`tg:${chatId}`, "telegram_linked", { uuid, result });
    // 3) chat_id як person-property (не як ключ!)
    this.client?.identify({ distinctId: `tg:${chatId}`, properties: { chat_id: chatId } });
  }
  digestSent(chatId: string, p: { subscriptionId: string; vacancies: number; pages: number }) {
    this.capture(`tg:${chatId}`, "digest_sent", p);
  }
  applyClicked(chatId: string | null, uuid: string | null, vacancyId: string) {
    this.capture(chatId ? `tg:${chatId}` : (uuid ?? "anon"), "digest_link_clicked", { vacancyId });
  }
  unsubscribed(chatId: string, uuid?: string) {
    this.capture(`tg:${chatId}`, "unsubscribed", { uuid });
  }

  // ── приватне: ніхто ззовні не торкається capture ─────────────────
  private capture(distinctId: string, event: string, props: Record<string, unknown>) {
    this.client?.capture({ distinctId, event, properties: props });
  }
  async onModuleDestroy() { await this.client?.shutdown(); }  // не загубити останні події
}
```
Зареєструвати `AnalyticsModule` в `app.module.ts` поряд з `ConfigModule`/`DatabaseModule`.

### 2.3 Точки виклику (мінімальні правки в наявному коді)
| Подія | Файл / місце | Виклик |
|---|---|---|
| `subscription_created` | `subscriptions.service.ts:create` (після `returning id`) | `analytics.subscriptionCreated(id, params)` |
| `telegram_linked` | `subscriptions.service.ts:linkChat` (гілка `"linked"`) | `analytics.telegramLinked(token, chatId, "linked")` |
| `digest_sent` | `digest.service.ts:deliver` (після успішного `record`) | `analytics.digestSent(chatId, {...})` |
| `digest_link_clicked` | `feed/redirect.controller.ts:apply` (там `TODO(tracking)`) | `analytics.applyClicked(chatId, uuid, vacancyId)` |
| `unsubscribed` | `/stop` + `unsub:<id>` callback у `telegram-commands.handler.ts` | `analytics.unsubscribed(chatId, id)` |

**Важлива дрібниця для `digest_link_clicked`:** зараз `/go/:id` не знає, з якої підписки прийшов клік. Щоб атрибутувати — у `digest.renderer.ts` (там, де будується `/go/:id`, ~рядок 143) дописати query-параметр, напр. `/go/:id?s=<subscriptionId>`, і прочитати його в `redirect.controller.ts` через `@Query("s")`. Без цього клік буде анонімним (можна на старті лишити так — KISS — і додати атрибуцію другим кроком).

> Усі виклики — fire-and-forget: жодного `await` у хендлерах запитів, помилка posthog не має валити доставку дайджесту чи редірект.

---

## 3. Frontend — кроки

### 3.1 ENV
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com` у `.env.local` / Vercel.

### 3.2 Provider
`apps/web/lib/posthog.tsx` (client component), підключити в `app/layout.tsx` поруч з `VercelAnalytics`:
```tsx
"use client";
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  capture_pageview: true,      // autocapture навігації
  person_profiles: "identified_only", // не плодити профілі на кожного анона
});
```
> Опційно (проти adblock): Next `rewrites` як reverse-proxy на `/ingest` → posthog. Не обов'язково для MVP.

### 3.3 Склейка в момент підписки — найважливіше
У `SubscribeButton.tsx` після успішного `subscriptionsApi.create(params)`:
```ts
const res = await subscriptionsApi.create(params);
posthog.capture("subscribe_clicked", { params });  // UI-намір (анонімний)
posthog.alias(res.id);                              // anon distinct_id  ⇄  subscription_uuid
```
`alias(res.id)` — це місток: анонімний браузерний `distinct_id` тепер дорівнює `subscription_uuid`. Після цього **серверна** подія `subscription_created` (distinct_id = той самий uuid) приземлиться в ту саму людину. Браузер і Telegram зшиються автоматично, бо обидва прив'язані до одного `subscription_uuid`.

---

## 4. Identity-модель детально (subscription_uuid → chat_id → auth)

### Етап A — анонімний web
PostHog видає браузеру cookie `distinct_id = anon_xxx`. Поки людина просто гортає фід — одна анонімна особа.

### Етап B — створення підписки (місток №1)
- web: `alias(subscription_uuid)` → `anon_xxx ⇄ subscription_uuid`.
- backend: `subscription_created` з `distinctId = subscription_uuid`.
- Результат: web-сесія і підписка — **одна особа**, ключ = `subscription_uuid`.

### Етап C — `/start <uuid>` у Telegram (місток №2)
Бот не має cookie — у нього лише `chat_id`. Backend у `linkChat`:
- `alias({ distinctId: subscription_uuid, alias: 'tg:'+chat_id })` → зливає telegram-особу з web-особою.
- далі всі post-link події (`digest_sent`, `unsubscribed`, клік) ідуть на **канонічний людський id `tg:<chat_id>`**.
- `chat_id` пишемо як **person-property**, а не як distinct_id.

**Чому `tg:<chat_id>` канонічний, а не `subscription_uuid`:** одна людина в одному чаті може мати **кілька** підписок (різні фільтри → різні uuid). Якби ключем лишався uuid — один чат = кілька «людей» у PostHog. Тому щойно з'являється `chat_id`, кожен її `subscription_uuid` aliased на той самий `tg:<chat_id>` → усі підписки чату зливаються в одну особу. `chat_id` = людський рівень, `subscription_uuid` = рівень окремої підписки.

### Етап D — майбутня авторизація (email / OAuth-провайдери / Clerk)
Коли з'явиться реальний акаунт (Clerk уже в дереві layout-а), отримаємо стабільний `user_id` (+ `email`).
- web (залогінений браузер): `posthog.identify(user_id, { email, provider })` → поточна браузерна особа зливається в `user_id`.
- зв'язок з Telegram-ідентичністю **їде безкоштовно через місток `subscription_uuid`**: якщо залогінений користувач створює підписку, її uuid уже прив'язаний до його `user_id`-особи; на `/start` цей uuid aliased на `tg:<chat_id>` → web-акаунт + email + Telegram-чат = одна особа.
- Якщо треба прив'язати **вже існуючий** Telegram-чат до нового акаунта — окремий explicit-крок: бот віддає одноразовий код, користувач вводить його в залогіненому web → `alias({ distinctId: user_id, alias: 'tg:'+chat_id })`. Але для більшості шлях через `subscription_uuid` спрацює сам.

**Висновок:** схема склейки не змінюється з приходом auth. `user_id` — це просто ще один alias на той самий person-граф. `subscription_uuid` лишається вічним містком web↔telegram незалежно від того, анонім користувач чи залогінений.

### Зведена таблиця ключів
| Контекст | distinct_id | роль |
|---|---|---|
| Анонімний браузер | `anon_xxx` (cookie) | тимчасовий |
| Підписка створена | `subscription_uuid` | **наскрізний місток** |
| Telegram прив'язаний | `tg:<chat_id>` | канонічна людина (pre-auth) |
| Авторизація (майбутнє) | `user_id` (Clerk) | канонічна людина (post-auth) |

---

## 5. Події (контракт)
| Event | Де | distinct_id | Ключові props |
|---|---|---|---|
| `subscribe_clicked` | web | anon/uuid | `params` |
| `subscription_created` | backend | `subscription_uuid` | `params` |
| `telegram_linked` | backend | `tg:<chat_id>` | `uuid`, `result` |
| `digest_sent` | backend | `tg:<chat_id>` | `subscriptionId`, `vacancies`, `pages` |
| `digest_link_clicked` | backend `/go/:id` | `tg:<chat_id>` | `vacancyId` |
| `unsubscribed` | backend | `tg:<chat_id>` | `uuid` |

---

## 6. Як це потім дивитися (короткий гайд)

**Головна воронка (Insights → Funnel):**
`subscribe_clicked → subscription_created → telegram_linked → digest_sent → digest_link_clicked`
— показує, де відвалюються: чи не дотискають Telegram `/start`, чи дайджест не конвертить у кліки.

**Що ще одразу корисно:**
- **Retention** на `digest_sent` як «повертається» — чи лишаються люди на дайджестах із тижня в тиждень.
- **Person profiles** — пошук особи за property `chat_id`; видно весь її шлях (web-візити → підписка → Telegram → кліки) однією стрічкою, бо все зшито в `subscription_uuid`.
- **Trends** на `subscription_created` з розбивкою по `params` (які фільтри найпопулярніші — годує dedup/таксономію).
- **Conversion `telegram_linked / subscription_created`** — скільки створених підписок реально доходять до `/start` (ключова дірка продукту).

**Перевірка, що склейка працює:** створи підписку в браузері → відкрий `/start` у Telegram → у PostHog та сама особа має містити і web-pageview-и, і `telegram_linked`, і `digest_sent`. Якщо їх двоє різних — десь не спрацював `alias` (etap B або C).

---

## 7. Порядок робіт (мінімум → повнота)
1. Backend `AnalyticsModule` + dormant `AnalyticsService` + ENV (нічого не шле без ключа).
2. `subscription_created` + `telegram_linked` (+ `alias` на `/start`) — мінімальна воронка вже працює.
3. Frontend provider + `alias(uuid)` у `SubscribeButton` — зшивається web.
4. `digest_sent` + `unsubscribed`.
5. Атрибуція кліків: `?s=<id>` у `/go/:id` + `digest_link_clicked`.
6. (Пізніше) `identify(user_id)` коли вмикається auth — без змін у п.1–5.

> KISS: п.1–3 — це вже корисна воронка. Решта — інкремент. Жоден крок не блокує доставку дайджесту (усе fire-and-forget, dormant без ключа).
