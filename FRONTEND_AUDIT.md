# Frontend audit — `apps/web/`

Аудит структури, зв'язності та ізоляції модулів фронту. Без змін коду.
Дата: 2026-05-29. Скоуп: весь `apps/web` (investigation + landing + shared + lib).
Метод: 3 паралельні читання по зонах + ручна верифікація гострих знахідок через grep.

---

## 1. Доменна карта — що для чого

Фронт — це **два різні застосунки під одним дахом**, плюс спільне підніжжя:

| Світ | Маршрути | Призначення | Дані |
|---|---|---|---|
| **investigation** (внутрішній тулінг) | `dashboard` (+`extraction`, `ingests/[id]`, `records/[id]`), `taxonomy`, `vacancies`, `unique-vacancies`, `sources` | Оператор дивиться, як працює пайплайн: інжести, вартість LLM-екстракції, здоров'я таксономії, якість дедупу, модерація вузлів | Live, з бекенду через `lib/api` |
| **landing** (маркетинг) | `/`, `/welcome` | Промо + waitlist; переважно статика з `data.tsx` на секцію + два live-блоки (market-snapshot, vacancy-list) | Статика + 2 live-фетчі |
| **спільне** | `components/ui-kit` (примітиви), `components/data` + `components/shared` (tier-2), `lib/api` (єдина межа з бекендом), `lib/format` + `lib/extracted-vacancy` (форматування/в'ю-моделі) | — | — |

Потік даних задуманий правильно: `page.tsx` (server) → `lib/api` (typed fetcher) → props → "дурні" компоненти. **Цей контракт у цілому дотримано** — усі сторінки серверні, жодна не тягне дані на клієнті, `'use client'` сидить на листках (форми, фільтри, анімації). Це сильна сторона, не міняй її.

**Вердикт по верхньому рівню:** логіка справді нескладна, а архітектурний кістяк здоровий. Проблема не в спагеті-залежностях, а в **розповзанні дублювання** і **кількох порушеннях ізоляції tier'ів** — код важко читати не тому, що заплутаний, а тому що однакові речі написані по-різному в кількох місцях.

---

## 2. Знахідки за пріоритетом

### P0 — порушення ізоляції / мертвий код (виправляти першими)

**[P0-1] Крос-роут імпорт `FilterToggles` — пряме порушення 3-tier**
`app/(investigation)/unique-vacancies/page.tsx:4` імпортує `../vacancies/_components/FilterToggles` — тобто page-private компонент однієї сторінки тягнеться сусіднім маршрутом. Це саме той coupling, який tier-система має забороняти.
→ Підняти в tier-2: `app/(investigation)/_components/FilterToggles.tsx`.

**[P0-2] `components/data/vacancy-filters/` — tier-2 сирота (620 LOC, 14 файлів)**
Лежить у tier-2 (`components/data/`), але споживається **лише однією секцією лендінгу** — усі 3 імпортери (`MarketFilters.tsx`, `use-url-filters.ts`, `to-filter-aggregates.ts`) живуть в `app/(landing)/_components/market-snapshot/`. Жодна investigation-сторінка її не імпортує. Правило трьох порушене — це tier-3, замаскований під tier-2.
→ Перенести в `app/(landing)/_components/market-snapshot/filters/` (або реально перевикористати на vacancies, якщо є намір).

**[P0-3] Мертвий `components/ui/button.tsx`**
Жоден `.tsx`/`.ts` його не імпортує — посилання тільки в `components.json:18` (shadcn-аліас). Реальна кнопка — `components/ui-kit/buttons/Button.tsx` (29 файлів через ui-kit). Дві різні кнопки-стилі збивають з пантелику.
→ Видалити `components/ui/button.tsx`.

**[P0-4] `lib/api` — немає спільного клієнта, дубльований boilerplate у 7 файлах**
`apps/web/CLAUDE.md` обіцяє `lib/api/client.ts`, якого нема. У кожному фетчері руками повторюється `const base = process.env.NEXT_PUBLIC_API_URL; if (!base) throw…`:
`aggregates.ts:41`, `dedup.ts:148`, `extraction-cost.ts:45`, `monitoring.ts:143`, `users.ts:19`, `vacancies.ts:189`, а `taxonomy.ts:163` вже виніс це у власний `apiBase()` — тобто розбіжність уже почалась. Приклад порту в тексті помилки розповзся: `extraction-cost.ts:48` каже `localhost:4567`, решта — `3000`.
Додатково `buildQs()` (URLSearchParams) скопійовано майже один-в-один у `dedup.ts:129`, `vacancies.ts:166`, `monitoring.ts:124`, `taxonomy.ts:150`. Жодного спільного хелпера; network-помилки (fetch кидає) ніде не обгорнуті.
→ Витягнути `lib/api/client.ts`: `apiBase()` + `apiFetch()` (обробка non-2xx + JSON) + `buildQs()`.

### P1 — дублювання логіки (висока вартість підтримки)

**[P1-1] Три «картки вакансії» дублюють 60-70% розмітки й логіки**
`RssRecordCard.tsx` (382), `VacancyCard.tsx` (334, investigation), `PublicVacancyCard.tsx` (318, landing) — це 3 найтовстіші файли фронту.
- `Fact` — байт-в-байт однаковий під-компонент у `VacancyCard.tsx:133` і `RssRecordCard.tsx:161`.
- `FlagPills`/`FlagPill` (логіка тону пілюль тестове/бронювання) продубльована в усіх трьох: `RssRecordCard.tsx:241`, `VacancyCard.tsx:215`, `PublicVacancyCard.tsx:292` — з трохи різними enum'ами тону (`ok|no|muted` vs `ok|warn`), тобто вже розійшлись.
- `formatLocations` імпортується з `lib/extracted-vacancy` у RssRecordCard, але **переписана локально** в `VacancyCard.tsx:330`.
→ Витягнути спільні листки (`Fact`, `FlagPills`, `formatLocations`) у tier-2 / `lib`; лишити роздільними тільки справді різні shell'и (sidebar/CTA/опис).

**[P1-2] Форматери розмазані: `lib/format` обходять локальними копіями**
`GroupCard.tsx` (unique-vacancies) має власні `fmtSalary` (`:112`), `fmtDate`/`fmtDateRange` (`:141`) та українську плюралізацію `pluralize` (`:128`) — паралельно з `lib/format.ts` і `lib/extracted-vacancy.formatSalary`. Формати несумісні (`formatRelative` → «2 дні тому» vs `fmtDate` → `YYYY-MM-DD`), тож хтось колись напише третій варіант.
→ Додати в `lib/format.ts`: `formatDateOnly`, `formatDateRange`, `formatSalaryRange`, `pluralizeUa`; прибрати локальні копії.

**[P1-3] Дубльований парсинг `searchParams` / пагінації між сторінками**
`taxonomy` має акуратний хук `_hooks/useUrlState.ts` (4 споживачі), але `vacancies/page.tsx:12-29` і `unique-vacancies/page.tsx:11-26` кожна окремо тримають свої `asString`/`asNonNegativeInt`/`asBool`. Те саме читання query-string у 3 несумісних виглядах.
→ Винести коерсери search-params у спільний `lib/` хелпер.

### P2 — узгодженість і дрейф (низький ризик, прибирати принагідно)

- **[P2-1]** Графіки `Donut` (`components/data/Donut.tsx`), `StackedBar`, `Sparkline` повністю generic (нуль доменних типів), але лежать у `components/data/` (семантика «доменні віджети»). Логічніше `components/ui-kit/charts/`. `Donut`/`StackedBar` поки мають по 1 споживачу — погранична tier-2.
- **[P2-2]** Tier-1 домішок: `components/ui-kit/inputs/SearchInput.tsx:18` має хардкодний placeholder «Search for skills…» — доменна лексика в примітиві. → винести в проп.
- **[P2-3]** Empty-state переписаний інлайн у 6+ місцях (extraction, unique-vacancies, vacancies, NodeList, SourcesTable, ActivityStream) — однаковий патерн, різний текст. Кандидат на `<EmptyState/>` у tier-2.
- **[P2-4]** Папка-сирота `app/(landing)/_components/waitlist/` містить лише хук `use-waitlist-signup.ts` (живий — його юзають `cta/FinalCTAForm.tsx` і `hero/HeroWaitlist.tsx`), але без власної секції. Не мертвий код, але назва папки вводить в оману — хук радше належить у `lib/` або поруч зі споживачами.
- **[P2-5]** Документація розійшлася з кодом: `apps/web/CLAUDE.md` стверджує «API integration: currently none — лендінг повністю статичний», хоча є цілий `lib/api/` + investigation-застосунок. Оновити.

---

## 3. Вердикт по 10 тезах

| # | Теза | Вердикт |
|---|---|---|
| 1 | Карта доменів читається з дерева | ✅ Так — структура самоописова, без звалищ |
| 2 | Потік даних односпрямований і чесний | ✅ Так — server→api→props скрізь дотримано |
| 3 | `lib/api` — єдина тонка межа з бекендом | ⚠️ Межа єдина, але **товста й дубльована** (P0-4) |
| 4 | 3-tier правило реально дотримане | ❌ Два порушення (P0-1 крос-роут, P0-2 tier-2 сирота) |
| 5 | Немає god-компонентів | ⚠️ Немає монстрів, але 3 картки 318-382 LOC дублюються (P1-1) |
| 6 | High cohesion: файл робить одне | ⚠️ В основному так; форматування протікає у в'ю (P1-2) |
| 7 | Low coupling: дуплікація vs спільне | ❌ Головний біль — дублювання карток/форматерів/парсерів |
| 8 | Межа server/client на листках | ✅ Так — зразково |
| 9 | Стан і сайд-ефекти під контролем | ⚠️ Хороший `useUrlState`, але парсинг URL продубльовано (P1-3) |
| 10 | Узгодженість, немає дрейфу, доки актуальні | ❌ Порти/форматери/empty-state розповзлись; CLAUDE.md застарів |

**Підсумок:** **low coupling — переважно так** (модулі ізольовані, окрім P0-1/P0-2); **high cohesion — частково** (логіка форматування витікає у в'ю-шар). Архітектура здорова, борг — це **копіпаста, що дрейфує**, а не структурні спагеті. Найбільший виграш: P0-4 (api-клієнт) + P1-1 (база для карток) приберуть ~половину «важко читати».

## 4. Що зроблено добре (не чіпати)

- Server/client межа на листках, усі сторінки серверні з фетчем нагорі.
- `lib/format.ts` і `lib/extracted-vacancy.ts` — чисті, сфокусовані в'ю-моделі (проблема лише в тому, що їх обходять).
- `ui-kit/index.ts` — охайний barrel, без звалища.
- Кожен `lib/api/*` файл когезивний (один ресурс), типи DTO акуратні.
- Лендінг: 8/11 секцій чітко тримають патерн `Section.tsx` + `data.tsx` + картки.

---

# Оновлення аудиту — рефактор `refactor/web-frontend-hygiene`

Додатковий прохід перед рефактором: конвенція хуків, мертвий код, рішення по архітектурі.

## 5. Нові знахідки (2-й прохід)

**[P0-5] Мертва спекулятивна абстракція у `vacancy-filters/` (130 LOC «про запас»)**
`FilterSidebar.tsx` (49 LOC) — **0 рантайм-споживачів**: єдиний консюмер (`MarketFilters`) компонує секції руками. `useFilters.ts` (82 LOC) — **хук ніхто не викликає**; живе лише тип `FiltersApi` (його реалізує `use-url-filters.ts:11`, споживає `ActiveFiltersBar`). Barrel `index.ts:15` досі їх експортує. Це YAGNI-борг: два взаємозамінні хуки за одним інтерфейсом збудовані під 2-го консюмера, який не прийшов.
→ Видалити `FilterSidebar.tsx` + хук `useFilters`; перенести інтерфейс `FiltersApi` у `types.ts`; лишити секції + `useUrlFilters`.

**[P1-4] Конвенція хуків розламана навпіл**
Іменування: `use-url-filters.ts` + `use-waitlist-signup.ts` (kebab) vs `useUrlState.ts` + `useFilters.ts` (camelCase файли). Зберігання: лише `taxonomy/_hooks/` — окрема папка, решта розсипом у папці секції.
→ Єдина конвенція: файл `use-x.ts` (kebab, як решта non-component файлів проєкту), page-private хуки в `<route>/_hooks/`, спільні — у `lib/hooks/`.

## 6. Рішення по архітектурі (узгоджено)

- **FSD — легка адаптація поверх 3-tier.** Беремо принципи, не структуру: явний public API на модуль (`index.ts`), односпрямовані імпорти (заборона cross-route reach-in, enforced lint-правилом), єдина конвенція хуків. **Без** перейменування папок у entities/features/widgets.
- **Стейт-менеджер (Redux/Zustand) — НЕ потрібен.** Модель стану = «URL — джерело істини, сервер — кеш». Нуль глобального клієнтського стану між незв'язаними деревами. Стор воював би з server-components. Якщо колись знадобиться — це TanStack Query (кеш серверних даних), не Redux/Zustand.
- **DI для `lib/api` — НЕ потрібен.** `lib/api/client.ts` — просто спільний хелпер (`apiBase`+`apiFetch`+`buildQs`), module-singleton фетчери лишаються.
- **DI на рівні компонентів = slot/inversion** (див. бест-практіси нижче). Це лікує і дублювання карток, і FSD-розмежування entity↔feature.
- **Тести — Jest (як в etl), тільки чисті функції `lib/`.** Без RTL/Playwright поки. Юніти пишуться ДО рефакторів форматерів/api → стають регрес-сіткою, якої проєкту бракує.

## 7. Бест-практіси: застосунки з картками + фільтрами

### Картки (entity) — розмежування через слоти
1. **Картка — це entity: рендерить лише дані вакансії.** Вона **не імпортує** фічі (apply-кнопка, модерація, copy-id). Замість цього виставляє **іменовані слоти** (`actions`, `sidebar`, `footer`), а сторінка/фіча інжектить вміст згори. Це і є FSD-інверсія «entity не тягне feature → слот».
2. **Один тип даних на картку через адаптер, а не 3 окремі картки.** Де лейаут справді різний (public vs internal) — ділимо внутрішні молекули (`Fact`, `FlagPills`, `SkillsList`, `KeyFacts`), а варіюємо лише shell + слоти.
3. **Форматування живе в `lib/` (`format`, `extracted-vacancy`), ніколи інлайн у картці.**
4. **Картка — server component за замовчуванням;** клієнтський лише вміст інтерактивного слота (`'use client'`-листок).

```
// антипатерн (зараз): 3 картки × дубль Fact/FlagPills/formatLocations
// ціль: <VacancyCard data={...} actions={<ApplyButton/>} footer={<RecordIds/>} />
//   де VacancyCard (entity) не знає, що таке ApplyButton (feature)
```

### Фільтри — headless hook + dumb-секції
1. **Headless-хук тримає стан + віддає інтерфейс (`FiltersApi`);** секції дурні, отримують **вузькі скалярні пропси** (`roles/activeId/onChange`), а не весь стан. — *уже зроблено правильно, не ламати.*
2. **Один state-backend за інтерфейсом, не два «про запас».** Лишаємо `useUrlFilters`; мертвий локальний `useFilters` — антиприклад.
3. **URL — джерело істини фільтрів** (shareable, server-refetch); не дзеркалити в клієнтський стор.
4. **`Section` бере `children` (slot)** — сторінка сама компонує свій набір фільтрів. Жодного хардкод-god-композера (`FilterSidebar` — антиприклад). Формалізувати compound-обгортку **лише** коли з'явиться 2-й консюмер.
5. **View-типи відв'язані від API-DTO через адаптер** (`toFilterAggregates`). — *уже правильно.*

### FSD-light (загальне)
1. **Public API на модуль через `index.ts`;** імпорт із кореня модуля, не з глибоких файлів.
2. **Імпорти односпрямовані:** `page → components/(shared|data) → ui-kit`. Жодних cross-route reach-in (`FilterToggles` — антиприклад). Enforce: eslint `no-restricted-imports`.
3. **Без передчасного tier-2 / «just in case».** `FilterSidebar`/`useFilters` — антиприклад.

## 8. Послідовність комітів (гілка `refactor/web-frontend-hygiene`)

| # | Коміт | Суть |
|---|---|---|
| A | `docs(web)` | цей апдейт аудиту + бест-практіси |
| B | `chore(web)` | мертвий код: `ui/button`, `FilterSidebar`, хук `useFilters`, stale CLAUDE.md |
| C | `test(web)` | Jest + юніти на `lib/format` (регрес-сітка) |
| D | `refactor(web)` | `lib/api/client.ts` (P0-4) + тести `buildQs` |
| E | `refactor(web)` | tier-ізоляція: `FilterToggles` ↑, `vacancy-filters` → landing (P0-1, P0-2) |
| F | `refactor(web)` | дедуп карток через слоти (P1-1, P1-2) + форматери в `lib/format` |
| G | `refactor(web)` | конвенція хуків (P1-4) |
