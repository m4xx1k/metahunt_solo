# Light-FSD правила для apps/web

Не канонічний FSD (7 шарів, ui/model/api сегменти — це ceremony, який нам не потрібен).
Беремо з FSD три ідеї: **шари з односторонніми імпортами**, **entities як доменні
іменники**, **features як дієслова**. Додаємо два механізми гнучкості: **слоти** і
**DI через props із server components**.

## Шари (4, не 7)

```
shared    →  ui-kit примітиви, charts, lib/api клієнт, lib/utils, lib/hooks
entities  →  доменні іменники: vacancy, skill, source, taxonomy-node
features  →  доменні дієслова: фільтрування, підписка, ранжування, модерація
app       →  роути = composition roots; фетчать дані, збирають фічі
```

**Правило імпортів — тільки вниз:**

- `shared` не знає нічого про домен. Якщо в примітиві з'явилось слово
  "vacancy"/"seniority" — він не shared.
- `entities` імпортує тільки `shared`. Entity ≠ entity (vacancy не імпортить skill —
  vacancy *рендерить* SkillChip? ні: див. виняток нижче).
- `features` імпортує `entities` + `shared`. **Фіча не імпортує іншу фічу.**
  Перетин фіч збирається на рівні app через композицію/слоти.
- `app` імпортує все.

**Виняток (прагматизм):** vacancy — центральна сутність домену, її картка природно
рендерить skill-чіпи і source-лейбли. Дозволяємо entities/vacancy → entities/skill,
entities/source. Це єдиний дозволений горизонтальний імпорт; новий — лише через ADR-думку.

## Що таке entity тут

`entities/<noun>/` = типи + чисті форматери + **dumb** презентаційні компоненти:

- `entities/vacancy` — VacancyCard (одна!), SeniorityBadge, DuplicatesBadge,
  formatLocations (одна реалізація!), labels із extracted-vacancy.
- `entities/skill` — SkillChip (required/optional/diff тони).
- `entities/source` — SourceLabel і т.п.

Entity-компонент: приймає DTO через props, нічого не фетчить, нема `use client`
без крайньої потреби, нема стейту. Типи DTO живуть у `lib/api/*` (бо це wire-контракт),
entity їх реіспортить — споживачі імпортять домен, не транспорт.

## Що таке feature тут

`features/<verb-or-capability>/` = UI + клієнтський стейт + url-стейт + адаптери:

- `features/vacancy-filters` — секції фільтрів, use-url-filters, FilterAggregates
  adapter-типи (те, що зараз розпиляно між components/data/filters і
  market-snapshot/filters).
- `features/market-snapshot` — живі чарти/таби ринку.
- `features/subscribe` — підписка/waitlist форми.

Фіча отримує дані **через props** (DI: server component у app/ фетчить через lib/api
і інжектить) або через adapter-інтерфейс (`FilterAggregates` — фіча каже, якої форми
дані їй треба; сторінка мапить DTO в цю форму). Фіча сама не фетчить.

## Слоти замість форків

Коли контексту треба "та сама картка, але з довіском" — не копіюй картку, додай слот:

```tsx
<VacancyCard vacancy={v} topSlot={<MatchOverlay fit={...} />} aside={<ModerationLinks />} />
```

`MatchCard` уже робить це композицією-обгорткою — це правильний патерн. Правило:
**варіант через слот/props, форк — заборонений** (форк = друга картка з copy-paste).

## Колокація і promotion (зберігаємо, це працює)

- Все народжується в `app/<route>/_components/` (tier-3). Лендінгові статичні секції
  (hero, how, pipeline, problem...) — це **контент, не фічі**; вони лишаються
  колокованими назавжди, їх не треба FSD-ифікувати.
- Promotion у `entities`/`features` коли: (а) з'явився другий споживач, АБО
  (б) це очевидний доменний іменник/дієслово, який вже дублюється (як skill-чіпи).
- Demotion: фіча/entity втратила другого споживача → назад у `_components/`.

## Анти-ceremony правила

- Без `ui/model/api` сегментів усередині слайсу, поки в ньому ≤ ~6 файлів. Flat until it hurts.
- Без нових barrel-файлів (`index.ts`). Імпорт прямий, по файлу. Існуючий
  ui-kit barrel — терпимо, нових не плодимо.
- `use client` ставиться на листі (кнопка, тогл), не на секції. Якщо секція стала
  client "бо так простіше" — це сигнал витягнути інтерактивний лист.
- Нейм-колізії заборонені: два `Section.tsx` в різних шарах — баг неймінгу
  (`CollapsibleSection` vs `Section`).
- Файл > ~250 рядків = ймовірно 2+ компоненти, розглянути спліт (не догма).

## Чого ми свідомо НЕ робимо

- Не робимо `widgets`/`processes` шари — Next App Router уже дає сторінкову композицію.
- Не переносимо `lib/` і `components/ui-kit` (це вже валідний shared-шар; переїзд = churn без виграшу).
- Не вводимо DI-контейнери/контексти "на майбутнє" — DI тут = props із server
  component + adapter-типи. Цього достатньо.
