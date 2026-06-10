# front-refactor — реструктуризація apps/web

Статус: **виконано — 5 комітів на гілці `refactor/front-structure`, не змерджено**.
Сесія: `front-refactor`. Початок: 2026-06-10.

## Результат (відхилення від плану)

- tsconfig paths правити не довелось — `@/*` вже покриває `entities/`, `features/`.
- Слоти `topSlot`/`aside` у VacancyCard **відкладені** (YAGNI): єдиний споживач-варіант
  (MatchCard) композиціює зовні; слот додамо, коли хтось захоче інжектити всередину картки.
- Коміт 5 замість use-client дієти став видаленням мертвого коду: TopSkills, TopRoles,
  SeniorityBars, FormatDonut, SourceTabs ніким не імпортувались. Усі живі `use client`
  виправдані (framer-motion або стейт) — бандл не змінився, знімати нічого.
- Залишки (свідомо не чіпав, investigation — нижчий пріоритет):
  `RssRecordCard.SkillsRow` досі рендерить чіпи локально (skills там `string[]`, не
  `NodeRef[]`); третій `formatLocations` у `lib/extracted-vacancy` — НЕ дубль
  (вхід `ExtractedLocation[]`).
- Нормативна частина rules.md перенесена в `apps/web/CLAUDE.md` (коміт 4).

## Мета

Прибрати "звалищні" папки (`components/data`, `components/shared`), розмазаність фіч
по трьох локаціях, дубльовані картки вакансій. Ввести light-FSD правила, заточені під
цей домен, щоб зміни у фронт давались легко.

## Файли

| Файл | Що там |
|---|---|
| [rules.md](rules.md) | Light-FSD правила для apps/web (шари, імпорти, слоти, DI) |
| [audit.md](audit.md) | Знахідки аудиту: дублювання, неправильні домівки, use-client карта |
| [target.md](target.md) | Цільова структура + покроковий план переїзду |

## TL;DR знахідок

1. Дві незалежні реалізації картки вакансії (`PublicVacancyCard` 326 рядків vs
   investigation `VacancyCard` 269) з дубльованими skill-чіпами, meta-рядками і
   **двома різними** `formatLocations`.
2. `components/data/` — не шар, а звалище: чарти + доменні бейджі + Pagination +
   фільтри впереміш; половина має одного споживача (порушення власного promotion-правила).
3. Фільтри мають правильну ідею шарування (примітиви + adapter-типи vs фічові секції),
   але живуть під неправильними іменами у двох неочевидних місцях.
4. `components/shared/` — 3 файли, споживає тільки layout. Фейковий tier-2.
5. Позитив: `ui-kit` чистий, `lib/api` — чітка межа, adapter-патерн у
   `filters/types.ts` вже FSD-ish, `MatchCard` — правильна композиція-декоратор.
