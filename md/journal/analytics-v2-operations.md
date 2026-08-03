# MetaHunt Analytics v2 — операційний документ

## Межі та джерела правди

Postgres є product truth: акаунти, auth identities, підписки та факт доставки.
PostHog v2 є єдиним джерелом поведінкової аналітики. Старий PostHog, ledger,
outbox, `product_events` і `analytics_journeys` — лише archive до завершення
observation window; їх не можна змішувати з v2 метриками або видаляти зараз.

Єдина продуктова ідентичність — `users.id`. Contacts починається з `users` і
має рівно один рядок на user ID. Telegram/Google — лише прикріплені способи
входу. PostHog `person_id`, provider IDs, journey IDs та анонімні browser IDs
не є полями Contacts і не беруть участі в його join.

## Identity flow

До входу браузер може мати лише анонімний PostHog ID. Після успішного
login/register adapter викликає `identify(users.id)`; PostHog сам поєднує
попередню browser activity. Після logout adapter викликає `reset()`. Нову
підписку створює тільки authenticated `users.id`; Telegram `/start` активує
deep link лише коли Telegram identity належить тому самому user. Не можна
підбирати owner для legacy unowned subscription.

## Заморожений v2 event contract

| Подія | Producer | Обовʼязкові властивості |
| --- | --- | --- |
| `$pageview` | browser після identify | стандартні sanitized URL properties, `is_test` |
| `account_created` | server після commit | `provider`, `is_test` |
| `signed_in` | browser/server після auth | `provider`, `is_test` |
| `subscription_created` | server після commit | `subscription_kind`, `is_test` |
| `digest_sent` | delivery worker після успішного send | `subscription_kind`, `is_test` |
| `vacancy_outbound_clicked` | web redirect / Telegram click | `surface` (`web_feed` або `telegram_digest`), `is_test` |
| `subscription_deactivated` | server після commit | `reason`, `is_test` |

Допустимі `provider`, `subscription_kind`, `surface`, `reason` — короткі
стабільні enum. Нова подія або властивість потребує одночасного оновлення
типізованого adapter, тесту, цієї таблиці та PostHog Data Management.
Server events — best-effort direct capture тільки після успішного DB commit:
analytics failure ніколи не відкочує product write.

PII allowlist забороняє email, Telegram chat ID/username, CV text, body
вакансії та raw URL query/bearer links. URL `?cv=` редагується перед capture.
Secrets не пишуться в logs.

## Contacts та чесні status-и

Сторінка бере максимум 100 `users.id`, один раз виконує bounded HogQL
aggregate `distinct_id IN (...)` і приєднує результат у памʼяті. Display name
Telegram має пріоритет над Google; raw provider IDs не показуються.

Status UI/API означає:

- `unconfigured` — немає v2 query config; product columns все одно доступні;
- `denied` — PostHog повернув 401/403, перевірити key/scope/project;
- `unavailable` — timeout, network, rate-limit або неочікувана відповідь;
- `empty` — запит успішний, але activity у періоді відсутня;
- `ready` — поведінкові дані доступні.

Нуль не є доказом outage: тільки успішня порожня відповідь означає `empty`.

## Human metrics і dashboards

DAU/WAU/MAU — distinct authenticated `users.id` у `$pageview` за 1/7/30 (або
вибраний) день. Усі human queries виключають `is_test=true` і known bot traffic.
Activation — authenticated account створив subscription; acquisition funnel:
pageview → account_created/signed_in → subscription_created → digest_sent →
vacancy_outbound_clicked. Retention — частка activated accounts з наступною
value action у наступному тижні; churn — `subscription_deactivated` або
відсутність active subscription за обраним правилом.

У чистому PostHog project створити три dashboards: **Founder weekly/value delivered**
(active users, digests, outbound clicks), **Acquisition → activation funnel**
та **Retention/churn**. Додати test/internal cohort і виключити її з кожного
human insight/dashboard.

## Конфігурація

Runtime має один product contract:

- `POSTHOG_API_KEY` — project ingestion key;
- `POSTHOG_PROJECT_ID` — numeric project ID для HogQL;
- `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PRIVATE_HOST` — scoped query key/host;
- `NEXT_PUBLIC_POSTHOG_KEY` — той самий public project key у frontend host;
- `ANALYTICS_TEST_TRAFFIC` і `NEXT_PUBLIC_ANALYTICS_TEST_TRAFFIC` — лише
  локальні/test deployments позначають події `is_test=true`.

`POSTHOG_ARCHIVE_API_KEY` необовʼязковий і за замовчуванням порожній: archive
code не надсилає подій у новий product project. Створення project/keys робить
лише owner: у PostHog створити окремий `MetaHunt`, project API key для
ingestion, personal/query key з
мінімальним read scope, test cohort, а потім три dashboards вище. Перевірити
project ID harmless HogQL query перед rollout. Ніколи не вставляти keys у git.

## Safe local Docker з restored production-like DB

Перед ETL перевірити та зупинити send-capable schedules:

```bash
docker.exe ps
npx ts-node --project tsconfig.json scripts/temporal-schedules.ts list
npx ts-node --project tsconfig.json scripts/temporal-schedules.ts pause "local restored-db verification"
```

У локальному `.env` встановити `ANALYTICS_TEST_TRAFFIC=true`, пустий
`TELEGRAM_BOT_TOKEN` (або disposable test bot), порожній production PostHog
key і лише disposable test project.
Після цього перебудувати саме поточну гілку та підняти stack:

```bash
docker compose -f compose.infra.yaml up -d --build
docker compose build --no-cache etl web
docker compose up -d etl web
```

У UI перевірити: unauthenticated POST subscription отримує 401; authenticated
flow створює subscription з owner; чужий Telegram account не активує link;
Contacts має один row на account, Telegram display перший; test events мають
`is_test=true` і не входять у metrics/funnel. Зупинка: `docker compose down`;
потім resume schedules тільки якщо це був неодноразовий локальний environment.

## Rollout, rollback та cleanup gates

До production: backup + checksum + isolated restore proof; read-only inventory
unowned subscriptions з `product-analytics-v2-release-gates.md`; reviewer та
before/after counts. Лише після письмового схвалення cleanup дозволено запуск
окрему `0039_subscriptions_user_id_not_null_after_approved_cleanup.sql`.
Вона не видаляє legacy rows і не вигадує owner. Rollback — вимкнути
`ANALYTICS_V2`, повернути application config та, за потреби, restore перевіреного
backup; очистити `POSTHOG_API_KEY` для emergency analytics rollback, не робити
PostHog identity merge/rewrites. Після observation window
виконати окремий staged retirement plan, не в тому ж deployment.
