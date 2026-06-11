# Цільова структура + план переїзду

Принцип: мінімум переміщень, максимум ясності. `lib/` і `ui-kit` не чіпаємо —
додаємо `entities/` і `features/`, розчиняємо `components/data` і `components/shared`.

## Цільове дерево

```
apps/web/
├── app/                            # роути = composition roots (без змін по суті)
│   ├── _components/                # app-chrome: Header, Footer, AppToaster (з components/shared)
│   ├── (feed)/
│   │   ├── [[...slug]]/page.tsx    # фетчить lib/api → інжектить у features
│   │   └── _components/            # ТІЛЬКИ статичний лендінг-контент: hero, how,
│   │                               #   pipeline, problem, roadmap, cta, about, ai, result
│   ├── (investigation)/            # без змін (колокація працює)
│   └── reverse-ats/_components/    # лишається page-private: ReverseAtsClient, MatchCard,
│                                   #   CandidateProfile (1 сторінка); фільтри → features
├── entities/
│   ├── vacancy/                    # VacancyCard (єдина, зі слотами topSlot/aside),
│   │   │                           #   SeniorityBadge, DuplicatesBadge,
│   │   │                           #   format-locations.ts (одна реалізація),
│   │   │                           #   labels.ts (з lib/extracted-vacancy)
│   └── skill/                      # SkillChip (required|optional|diff тони)
├── features/
│   ├── vacancy-filters/            # злиття components/data/filters +
│   │   │                           #   market-snapshot/filters: типи-адаптери,
│   │   │                           #   секції, pill/chip класи, use-url-filters
│   ├── market-snapshot/            # чарти/таби/тогли ринку (з (feed)/_components)
│   └── subscribe/                  # SubscribeButton, waitlist-форми (якщо 2+ місця)
├── components/ui-kit/              # без змін + ДОДАЄМО: Pagination,
│   └── charts/                     #   Donut, Sparkline, StackedBar (domain-agnostic)
└── lib/                            # без змін: api/, hooks/, format, utils
```

`components/data/` і `components/shared/` — видаляються повністю.

## Ключові рішення для розбору з Максом

У плані комітів нижче для кожного вибрано дефолт (позначено «◄ рішення №N») —
якщо не згоден, кажи до старту відповідного коміту.

1. **Одна VacancyCard зі слотами чи дві стилістично різні?** Feed-картка і
   investigation-картка мають різний стиль (тіні, CTA-сайдбар, copy-ідентифікатори).
   Пропозиція: одна `entities/vacancy/VacancyCard` зі слотами `topSlot`/`aside`/`footer`
   + спільні будівельні блоки (SkillChips, MetaRow, FactList, formatLocations);
   investigation-картка збирається з тих самих блоків, але МОЖЕ лишитись окремим
   компонентом, якщо злиття вимагає >3 props-перемикачів стилю. Блоки спільні — обгортка ні.
2. **Куди ranked/match-оверлей?** Зараз MatchCard обгортає PublicVacancyCard — патерн
   правильний; лишити в reverse-ats/_components (1 споживач), skill-diff лінію будувати
   з entities/skill/SkillChip.
3. **market-snapshot: фіча чи лендінг-контент?** Він живий (API-driven) → фіча.
   Але якщо юзається тільки на одній сторінці — можна лишити колокованим і промоутнути
   пізніше. Схиляюсь до features/ одразу, бо фільтри вже спільні з reverse-ats.
4. **Alias-и:** додати `@/entities/*`, `@/features/*` у tsconfig paths.

## План міграції — одна гілка, 5 комітів

Гілка: `refactor/front-structure`. Кожен коміт самодостатній і зелений
(`pnpm lint:web && pnpm build:web` перед кожним); якщо щось пішло не так —
відкочуємо коміт, а не гілку. Жодних поведінкових змін, крім узгодженого
`formatLocations` у коміті 1 (зафіксувати вибір у повідомленні коміту).

### Коміт 1 — `refactor(web): extract vacancy/skill building blocks into entities`

Тільки витяг спільного, нічого не переміщаємо і не перейменовуємо.

- `tsconfig.json`: додати paths `@/entities/*`, `@/features/*`.
- Створити `entities/skill/SkillChip.tsx` — один чіп з тонами
  `required | optional | success | danger | muted` (покриває і feed/investigation
  чіпи, і SkillLine-тони reverse-ats).
- Створити `entities/vacancy/`:
  - `format-locations.ts` — єдина реалізація; беремо повнішу з PublicVacancyCard
    (спільна країна виноситься в кінець, `+N` overflow) — investigation-картка
    отримує цю ж поведінку. ◄ рішення №2.
  - `Fact.tsx` — переїзд з `app/(investigation)/_components/Fact.tsx`
    (він уже спільний за змістом); `SidebarFact` у PublicVacancyCard замінюється ним.
  - `FlagPills.tsx` — переїзд з `app/(investigation)/_components/FlagPills.tsx`;
    приватний `FlagPill` у PublicVacancyCard — видалити, використати спільний.
- Перевести на блоки: `PublicVacancyCard`, investigation `VacancyCard`
  (його `SkillsRow`/`formatLocations` — видалити), `MatchCard.SkillLine`.

### Коміт 2 — `refactor(web): move vacancy cards to entities/vacancy with slots`

- `components/data/PublicVacancyCard.tsx` → `entities/vacancy/VacancyCard.tsx`;
  додати слоти `topSlot` / `aside` (рендеряться, тільки якщо передані —
  поточний вигляд feed не змінюється). ◄ рішення №1.
- Investigation `VacancyCard` лишається page-private, але перейменовується в
  `VacancyInspectCard.tsx` (знімаємо нейм-колізію за правилом rules.md).
- `components/data/SeniorityBadge.tsx`, `components/data/DuplicatesBadge.tsx`
  → `entities/vacancy/`.
- Оновити імпорти: VacancyList (feed), MatchCard (reverse-ats), investigation
  vacancies/records сторінки.

### Коміт 3 — `refactor(web): unify filter layers into features/vacancy-filters`

- `components/data/filters/*` (types, Section, EnumSection, PerksFilter, pill) +
  `app/(feed)/_components/market-snapshot/filters/*` (RoleSection, SkillsSection,
  SourceSection, FacetSection, TrackTree, ActiveFiltersBar, SelectRow)
  → `features/vacancy-filters/` одним плоским списком.
- `use-url-filters.ts` з market-snapshot → туди ж (це стейт фільтрів, не снапшота).
- `Section.tsx` → `CollapsibleSection.tsx` (друга нейм-колізія знята).
- Видалити барель `filters/index.ts` — всі імпорти прямі по файлу.
- Оновити імпорти в market-snapshot і reverse-ats.
- market-snapshot як ціле НЕ переїжджає (лишається колокованим до другого
  споживача). ◄ рішення №3.

### Коміт 4 — `refactor(web): dissolve components/data and components/shared`

- `Pagination.tsx` → `components/ui-kit/navigation/`.
- `Donut.tsx`, `Sparkline.tsx`, `StackedBar.tsx` → `components/ui-kit/charts/`
  (вони domain-agnostic; якщо при переносі виявиться доменний слід — спершу почистити).
- `Header.tsx`, `Footer.tsx`, `AppToaster.tsx` → `app/_components/`.
- Видалити порожні `components/data/` і `components/shared/`.
- `apps/web/CLAUDE.md`: 3-tier таблиця → нові шари (нормативна частина rules.md
  переїжджає туди, тут лишається посилання).

### Коміт 5 — `refactor(web): push 'use client' to leaves in feed sections`

Єдиний коміт із потенційно помітним ефектом (менший client bundle):

- Перевірити TopSkills / TopRoles / SeniorityBars / TotalCounter — якщо вони
  рендерять статичні props без інтерактиву, зняти `use client` (лишити на
  тоглах/табах: DedupeToggle, SkillScopeToggle, SourceTabs).
- PipelineCard / Visuals на лендінгу — якщо клієнтськість заради анімації,
  витягнути анімований лист у дрібний client-компонент.
- Заміряти до/після: розмір First Load JS головної з `pnpm build:web` виводу,
  зафіксувати цифри в коміті.
- Якщо по ходу виявиться, що зняти нічого не можна, — коміт скорочується до
  фіксації заміру і нотатки чому (не тягнемо силою).

### Закриття гілки

- Оновити статус у `README.md` трекера, перенести папку в
  `md/journal/migrations/_done/` після мерджу.
- Прогнати doc-аудит з кореневого CLAUDE.md (`find md product -name '*.md' …`).

## Definition of done

- Папок `components/data`, `components/shared` не існує.
- Одна реалізація formatLocations, skill-чіпів, факт-блоків.
- apps/web/CLAUDE.md описує нові шари (rules.md → переїжджає туди як норматив).
- Імпорт-правило шарів (down-only) задокументоване; в ідеалі — eslint boundary-правило.
