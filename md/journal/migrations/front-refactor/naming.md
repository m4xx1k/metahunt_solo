# Словник фронтенда + неймінг-аудит

Статус: аудит зроблено 2026-06-10, топ-3 ренейми ЗАСТОСОВАНІ тим же днем
(`FacetSection`→`TrackAxisSection` + `Facet`→`TrackAxis`, `Snapshot`→`FeedHero`,
`MarketFilters`→`FeedFilters`, папка `market-snapshot/`→`market/`).
`EnumSection`→`PillsSection` свідомо НЕ робив (низький пріоритет, churn > користь).

## Доменний словник (як називаємо речі)

| Термін | Що означає | Де живе |
|---|---|---|
| **vacancy** | Центральна сутність: одна вакансія (DTO з беку) | `entities/vacancy`, `lib/api/vacancies` |
| **track** | Гілка таксономії для браузингу (discipline → stack/language) | TrackTree, `lib/api/tracks` |
| **axis** (зараз "facet") | Одна з двох осей активного треку: roles або skills | FacetSection |
| **skill required/optional** | must-have / nice-to-have скіл вакансії | SkillChip tones |
| **skill have/missing/bonus** | diff скілів кандидата проти вакансії (reverse-ATS) | SkillChip tones |
| **source** | Джерело вакансій (Djinni, DOU…) | SourceSection, SourceTabs(†) |
| **perks** | "бронь" + "без тесту" — два quick-фільтри ринку | PerksFilter |
| **fit tier** | STRONG / GOOD / STRETCH вердикт матчингу | MatchCard |
| **aggregates** | Зведена статистика ринку з `/market/aggregates` | to-filter-aggregates |
| **dedup** | Прибрані дублікати вакансій між джерелами | DedupeToggle, DuplicatesBadge |
| **record** | Сирий RSS-запис до екстракції (internal) | RssRecordCard |
| **extracted** | Те, що BAML видобув із record | lib/extracted-vacancy |

## Вердикти: бред → ренейм

| Зараз | Проблема | Пропозиція |
|---|---|---|
| `FacetSection` | "facet" — жаргон пошукових движків; нічого не каже про трек | `TrackAxisSection` (+ тип `Facet` → `TrackAxis`) |
| `Snapshot` | Це давно не снапшот статистики — це **hero фіда** (заголовок + лічильник + pipeline) | `FeedHero` |
| папка `market-snapshot/` | Legacy-назва; всередині hero + фільтри + тогли | `market/` |
| `MarketFilters` vs `MatchFilters` | Одна літера різниці, два різні світи (фід vs reverse-ATS) — головна пастка | `MarketFilters` → `FeedFilters` |
| `EnumSection` | Названо за TS-типом входу, а не за тим, що бачить юзер | `PillsSection` (опційно, низький пріоритет) |

## Вердикти: нормальні, не чіпати

- **`TrackTree`, `SelectRow`, `ActiveFiltersBar`, `SkillsSection`, `RoleSection`, `SourceSection`** — кажуть що рендерять. RoleSection і TrackTree співіснують легально: перший — плоский режим лендінга, другий — track-режим (комент в MarketFilters це пояснює).
- **`PerksFilter`** — суфікс "-Filter" вибивається з "-Section" сусідів, але назва чесна; не варто churn.
- **`to-filter-aggregates`** — зразковий неймінг адаптера (verb-prefix мапер). Так і називати майбутні адаптери.
- **`use-url-filters`, `FiltersApi`, `FilterState`, `EMPTY_FILTERS`** — чисто.
- **`filter-model.ts`, `samples.ts`** (reverse-ats) — локальні, коменти пояснюють; ок.
- **`ReverseAtsClient`** — "Client"-суфікс = Next-конвенція для client island сторінки; прийнятно.
- **`lib/extracted-vacancy`** — назва дзеркалить BAML-тип, це задокументовано (ADR-0005); ок. (Майбутнє: його лейбли/форматери по суті належать `entities/vacancy` — окрема розмова.)
- **`SkillChip`, `Fact`, `FlagPill(s)`, `CollapsibleSection`, `VacancyInspectCard`** — нові з цього рефактора, самоописові.

## Дрібниці (не варті ренейму зараз)

- `ui-kit/typography/Tag` — рендерить eyebrow-лейбл ("> як це працює"); "Tag" трохи конфліктує зі скіл-чіпами в голові, але юзається скрізь — чіпати дорого.
- `pill.ts` (vacancy-filters) — два класи-хелпери `pillClass`/`chipClass`; файл міг би зватись `pill-styles.ts`.
- `types.ts` (vacancy-filters) — generic ім'я, але це конвенція; всередині насправді контракт фічі.

## Якщо ренеймити — порядок

Один коміт `refactor(web): rename legacy market-snapshot vocabulary`:
1. `FacetSection` → `TrackAxisSection`, тип `Facet` → `TrackAxis`
2. `Snapshot.tsx` → `FeedHero.tsx`, папка `market-snapshot/` → `market/`
3. `MarketFilters` → `FeedFilters`
Все механічне (grep + sed), ~10 файлів імпортів, поведінка не змінюється.
