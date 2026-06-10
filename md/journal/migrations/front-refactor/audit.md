# Аудит apps/web — знахідки (2026-06-10)

Масштаб: 162 ts/tsx файли, ~12.9k рядків. `app/(feed)/_components` — 50 файлів.

## 1. Картки вакансій — головне дублювання

Чотири картки: `components/data/PublicVacancyCard` (326 р., найбільший файл фронта),
`app/(investigation)/vacancies/_components/VacancyCard` (269 р.),
`app/reverse-ats/_components/MatchCard`, `app/(investigation)/_components/RssRecordCard` (321 р.).

Конкретні дублі між PublicVacancyCard і investigation VacancyCard:

| Що | PublicVacancyCard | VacancyCard (investigation) |
|---|---|---|
| Локації | `formatLocationsCapped` (parsing країни, +N overflow) | **інша** `formatLocations` (без країни) |
| Skill-чіпи | інлайн JSX `border-accent / border-border` ×2 | свій `SkillsRow` з тими ж класами |
| Факт-блок | приватний `SidebarFact` | імпортить спільний `_components/Fact` |
| Пілси test/бронь | приватний `FlagPill` | спільний `_components/FlagPills` |
| Meta-рядок | масив `metaItems` з labels | свій `MetaTags` з тих самих labels |

Обидві тягнуть одні labels/formatters із `lib/extracted-vacancy` — тобто **дані спільні,
JSX скопійований**. Стилістика навмисно різна (feed строгий, investigation з тінями) —
але skill-чіпи/локації/факти однакові по суті.

**Позитив:** `MatchCard` НЕ форкає — обгортає `PublicVacancyCard` оверлеєм
(fit-tier + skill-diff). Це готовий зразок слот/композиція-патерну.

`RssRecordCard` — окремий світ (сирий RSS-запис, не вакансія) — лишається на місці.

## 2. components/data — звалище без критерію

| Файл | Споживачі | Вердикт |
|---|---|---|
| PublicVacancyCard | VacancyList (feed), MatchCard (reverse-ats) | → `entities/vacancy`, legit 2 споживачі |
| SeniorityBadge | 4 (feed card, 2× investigation, records page) | → `entities/vacancy` |
| DuplicatesBadge | **1** — тільки PublicVacancyCard | → `entities/vacancy`, поруч із карткою |
| Pagination | 4 (feed, reverse-ats, 2× investigation) | generic UI → `ui-kit` |
| Donut | **1** — taxonomy VerifiedDonut | порушує promotion-правило → ui-kit/charts або demote |
| Sparkline | 2 (sources, dashboard) | → ui-kit/charts (domain-agnostic) |
| StackedBar | **1** — taxonomy AxisBar | те саме що Donut |
| filters/* | feed + reverse-ats | → `features/vacancy-filters` (див. §3) |

Висновок: "data" змішує 3 категорії — доменні компоненти (entities), чарти (shared/ui),
generic UI (ui-kit). Категорія "data" не каже нічого → видалити папку повністю.

## 3. Фільтри — шарування правильне, домівки ні

Реальність краща за очікування: шарування вже існує —

- `components/data/filters/` = примітиви + adapter-типи (`FilterAggregates`,
  `FilterState`, `pillClass/chipClass`, Section, EnumSection, PerksFilter). Коментар у
  `types.ts` прямо описує adapter-патерн: "any consumer maps its own source into these
  shapes via an adapter" — це FSD public-api у дикій природі.
- `app/(feed)/_components/market-snapshot/filters/` = фічові секції (Role, Skills,
  Source, Facet, TrackTree, ActiveFiltersBar) + `index.ts`, який **реіспортить**
  примітиви з data/filters (барель маскує шарування).
- reverse-ats реюзає примітиви напряму.

Проблеми: (а) примітиви живуть під ім'ям "data" — ніхто їх там не шукатиме;
(б) фічові секції лежать у page-private `_components`, хоча їх контракт уже
використовується двома сторінками через типи; (в) барель-реіспорт ховає, звідки що.
Це **одна** фіча `vacancy-filters`, розрізана навпіл.

## 4. use client карта (~50 файлів)

- `ui-kit`: чистий — клієнтські тільки CopyButton, EmailInput. ✅
- `market-snapshot`: **весь** підтрі клієнтський (всі чарти, таби, тогли, секції
  фільтрів). Частково виправдано (інтерактив), але напр. TopSkills/TopRoles/
  SeniorityBars — рендерять статичні дані, клієнтськість треба перевірити.
- Лендінг-секції: `PipelineCard`, `Visuals` клієнтські (анімації?) — перевірити, чи
  можна лишити server + клієнтський лист.
- `components/data/filters/Section` — client заради мобільного акордеону; ок, але це
  ще один аргумент, що це не "data".

Окремий пункт дослідження перед міграцією: заміряти client bundle головної сторінки.

## 5. components/shared — фейковий tier-2

Header, Footer, AppToaster — споживаються тільки layout-ами (root + feed pages).
Це app-level chrome, не shared-шар. → `app/_components/` або `features/` за змістом.

## 6. Нейм-колізії і дрібниці

- Два `Section.tsx`: `ui-kit/layout/Section` і `data/filters/Section` (collapsible).
- `tsconfig.tsbuildinfo` лежить у корені apps/web (перевірити .gitignore).
- `design/landing.pen` — один файл, ок.

## Що НЕ чіпаємо (здорове)

- `lib/api/` — 13 типізованих фетчерів через спільний client.ts, єдина межа з беком. ✅
- `ui-kit` структура (badges/buttons/cards/inputs/layout/typography). ✅
- Колокація `_components` per route в investigation. ✅
- Таксономія `_hooks` патерн. ✅
