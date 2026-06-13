# MetaHunt — Brief на реалізацію семантичної дедуплікації вакансій

> **Адресат:** код-агент із доступом до репозиторію MetaHunt.
> **Призначення:** brief з контекстом, концепцією, схемою даних, edge-cases і open questions. На основі цього brief ти разом з користувачем розкладеш роботу на конкретні задачі/PR-и. **Не пиши код наосліп** — спершу пройдись по open questions і узгодь рішення.

---

## 1. Контекст і обмеження

- **Проєкт:** MetaHunt — ETL-агрегатор IT-вакансій українського ринку (Djinni + DOU через RSS, NestJS-бекенд, Temporal-оркестрація, PostgreSQL + Drizzle, Next.js-фронт).
- **Дедлайн:** менше тижня до захисту БКР. MVP-рівень якості з акцентом на **демонстрабельність на комісії**.
- **Дані:** ~3-4к вакансій у базі, ~66% Djinni / ~33% DOU. Обидва джерела активні, реальні cross-source дублі присутні.
- **pgvector** уже встановлений в БД. Embedding-логіки в коді ще немає.
- **Чому це робиться:** дедуплікація заявлена в анотації, ключових словах, меті, науково-технічній новизні та об'єкті/предметі дослідження звіту з практики. Семантична дедуп на векторних ембедингах + Golden Record — 1 із 3 елементів задекларованої наукової новизни. Видаляти з диплома — означає ослабити новизну і переписувати ~20+ параграфів у чутливих місцях.

### Критичне обмеження по даних

**Djinni не віддає назву компанії в RSS-фіді.** Тому матчити дублі за `companyName` ненадійно — для Djinni-вакансій це поле буде `null` або витягнуте LLM з опису (нестабільно). Концепція дедуплікації має це враховувати: pre-filter будується на стабільних структурованих полях + дата публікації, а компанія використовується **тільки як підсилюючий сигнал**, не як обов'язковий критерій.

---

## 2. Цілі

**Системні (для коду):**
1. Vacancy отримує семантичне векторне представлення.
2. З'являється сутність **UniqueVacancy** — канонічне групування вакансій, що описують ту саму позицію з різних джерел.
3. Конвеєр Temporal автоматично embeddить нові вакансії і шукає для них групу.
4. Існує operator-UI для перегляду UniqueVacancy, оригіналів, метаданих злиття, ручного розмерджу та повторного злиття.
5. При оновленні опису вакансії система коректно перевизначає її приналежність до UniqueVacancy.

**Для захисту (визначально для UX-рішень):**
- Видно різницю проти тривіального checksum-дедупу (показати дашборд із групами cross-source дублів).
- Для будь-якої пари (Vacancy → UniqueVacancy) видно **чому** її туди віднесено: similarity score, які pre-filter поля збіглися, який embedding-модель, коли.
- Видно метрики: скільки знайдено дублів, скільки cross-source, який середній similarity у групах.
- Операторський сценарій "це не дубль" / "це насправді дубль" — повністю клікабельний.

---

## 3. Концепція гібридної дедуплікації

Працюємо у **два етапи**:

### Етап 1. Pre-filter (структурні кандидати)

З БД відбираємо потенційних кандидатів, для яких має сенс рахувати схожість. Обов'язкові обмеження:

- `vacancy.sourceId != candidate.sourceId` — **ніколи не шукаємо дублі в межах одного джерела.**
- `|vacancy.publishedAt - candidate.publishedAt| <= WINDOW_DAYS` (стартовий WINDOW = 14 днів, відкалібрувати).
- `candidate.status` активний (не archived).

М'які умови (підсилюючі сигнали, але null-safe — не виключаємо кандидата за null):

- `role` нормалізовано рівне (lowercase, strip seniority/level з тексту) **або** `seniority` рівне.
- `workFormat` рівне (якщо обидва не null).
- `companyName` рівне після нормалізації (lowercase, strip "LLC/Ltd/Inc/ТОВ" тощо) — **тільки коли поле є з обох сторін**. Для пар Djinni↔Djinni / Djinni↔DOU це часто буде null з одного боку — тоді ігноруємо.

Pre-filter повертає N кандидатів (стартово 20-50), яких далі ранжуємо за similarity.

### Етап 2. Семантична схожість (ANN на pgvector)

Для кожного кандидата рахуємо cosine similarity між embedding-ами. Використовуємо **HNSW-індекс** з `vector_cosine_ops`. SQL у форматі:

```sql
SELECT v.id, 1 - (v.embedding <=> $1) AS similarity
FROM vacancies v
WHERE v.source_id != $2
  AND v.published_at BETWEEN $3 AND $4
  AND v.status = 'active'
  AND ... (інші pre-filter умови)
ORDER BY v.embedding <=> $1
LIMIT 50;
```

Рішення:

- `similarity >= HARD_THRESHOLD` (стартово 0.92) → впевнений дубль, мерджимо автоматично в існуючу UniqueVacancy кандидата.
- `SOFT_THRESHOLD <= similarity < HARD_THRESHOLD` (стартово 0.85-0.92) → "підозра", позначаємо як `suggested_match`, оператор підтверджує/відхиляє вручну.
- `similarity < SOFT_THRESHOLD` → не дубль.

Якщо для нової Vacancy не знайшлось жодного кандидата вище SOFT — створюємо **нову UniqueVacancy**, де ця Vacancy — canonical.

### Що embeddити

Стартова версія: конкатенація `role` + `seniority` + `description` (raw або після LLM-нормалізації — узгодити). Опціонально додати рядок зі стеком required-навичок. Модель: `text-embedding-3-small` (1536 dim, $0.02 / 1M токенів — дешево). Зберігати `embeddingModel` як колонку для майбутніх міграцій.

**Open question (для агента):** чи embeddити сирий RSS-опис, чи витягнутий LLM нормалізований опис? Сирий — стабільніший і дешевший, але "шумніший". Узгодити з користувачем.

---

## 4. Зміни в схемі БД

### 4.1. Vacancy — нові колонки

- `embedding vector(1536)` nullable — векторне представлення.
- `embeddingModel text` nullable — наприклад `'text-embedding-3-small'`.
- `embeddingGeneratedAt timestamptz` nullable — коли згенеровано.
- `embeddingSourceHash text` nullable — sha256 від тексту, на якому згенеровано embedding (для виявлення "embedding stale" після оновлення опису).
- `uniqueVacancyId uuid` nullable, FK → `unique_vacancies.id` ON DELETE SET NULL.

### 4.2. Нова таблиця `unique_vacancies`

| Поле | Тип | Призначення |
|---|---|---|
| `id` | uuid PK | |
| `canonicalVacancyId` | uuid FK → vacancies.id | Та Vacancy, яку показуємо як "головну" в групі. Стартова стратегія — найперша за `publishedAt`; перевибирається при unmerge / archive. |
| `centroidEmbedding` | vector(1536) | Середнє ембедингів усіх вакансій у групі. Використовується як точка прив'язки при додаванні нових вакансій. Перераховується при кожному merge/unmerge. |
| `sourceCount` | int | Денормалізований лічильник, скільки різних `sourceId` представлено у групі. |
| `vacancyCount` | int | Денормалізований лічильник вакансій у групі. |
| `firstSeenAt` | timestamptz | publishedAt найранішої вакансії групи. |
| `lastSeenAt` | timestamptz | publishedAt найпізнішої вакансії групи. |
| `mergedSkills` | jsonb | Об'єднаний набір skills (union required, union optional) — для UI/фільтрів стрічки. |
| `salaryMin`, `salaryMax`, `salaryCurrency` | | Агрегована зарплатна вилка (min з min, max з max — або найповніше значення). |
| `status` | enum `active`/`archived` | Якщо всі вакансії групи archived → group archived. |
| `manualOverride` | bool | true, якщо оператор втручався — на цю групу не діє автоматичне переоцінювання при оновленнях. |
| `createdAt`, `updatedAt` | | |

### 4.3. Нова таблиця `unique_vacancy_links` (audit + диагностика)

Зв'язок Vacancy ↔ UniqueVacancy з історією рішень. Це окрема таблиця **поза** FK на Vacancy.uniqueVacancyId — там тільки поточний стан, а тут історія.

| Поле | Тип | Призначення |
|---|---|---|
| `id` | uuid PK | |
| `vacancyId` | uuid FK | |
| `uniqueVacancyId` | uuid FK | |
| `similarity` | numeric(5,4) | Score з яким віднесено (null для canonical / нової групи). |
| `matchedAgainstVacancyId` | uuid FK nullable | З якою саме Vacancy збіглося (для пояснення на UI). |
| `prefilterMatches` | jsonb | Які поля збіглися: `{role: true, workFormat: true, seniority: true, company: false, dateWindowDays: 2}`. |
| `decidedBy` | enum `auto`/`operator` | |
| `decidedByUserId` | uuid nullable | Якщо operator. |
| `action` | enum `linked`/`unlinked`/`canonical_assigned` | |
| `embeddingModel` | text | Який модель прийняв рішення. |
| `createdAt` | timestamptz | |

Це **ключова таблиця для defendability** — на UI з її даних показуємо "чому ця вакансія тут".

### 4.4. Нова таблиця `unique_vacancy_blocklist` (заборона повторного автозлиття після unmerge)

Якщо оператор сказав "це не дубль" — записуємо пару, і автоматика її більше не з'єднає, навіть якщо similarity зросте.

| Поле | Тип |
|---|---|
| `vacancyAId` | uuid FK |
| `vacancyBId` | uuid FK |
| `reason` | text nullable |
| `createdAt` | timestamptz |
| UNIQUE | `(LEAST(a,b), GREATEST(a,b))` |

### 4.5. Індекси

- `vacancies.embedding` — HNSW з `vector_cosine_ops`. Параметри `m=16, ef_construction=64` як стартові, відкалібрувати при потребі.
- `vacancies.uniqueVacancyId` btree.
- `vacancies (sourceId, publishedAt)` btree — для pre-filter.
- `unique_vacancy_links.vacancyId`, `.uniqueVacancyId` btree.

---

## 5. Embedding pipeline (Temporal)

Конвеєр зараз: `extract → parse → load`. Додаємо новий крок **між** parse і load (або в кінці — узгодити з агентом залежно від того, де зараз сидить логіка створення/оновлення Vacancy).

### Нова активність: `embedVacancyActivity`

Вхід: `vacancyId`.
Логіка:
1. Завантажити Vacancy.
2. Скласти embedding-текст (див. розділ 3).
3. Порахувати `embeddingSourceHash = sha256(embeddingText)`. Якщо `vacancy.embeddingSourceHash === newHash` і `embeddingModel === current` → скіпнути (idempotency).
4. Викликати OpenAI embeddings API. Ретраї і таймаути — як в інших LLM-активностях.
5. Записати `embedding`, `embeddingModel`, `embeddingGeneratedAt`, `embeddingSourceHash`.
6. Викликати `resolveUniqueVacancyActivity(vacancyId)` (наступний крок) або зробити це окремою активністю у воркфлоу.

### Нова активність: `resolveUniqueVacancyActivity`

Вхід: `vacancyId`.
Логіка:
1. Завантажити Vacancy з embedding.
2. **Якщо у Vacancy вже є `uniqueVacancyId`** → це апдейт. Перейти до гілки UPDATE (див. п.7.2).
3. Інакше — це NEW або re-resolve.
4. Виконати pre-filter + ANN-пошук кандидатів (див. розділ 3).
5. Перевірити blocklist — викинути всі пари, які в `unique_vacancy_blocklist`.
6. Серед решти знайти найкращий match:
   - Якщо `similarity >= HARD_THRESHOLD` → приєднати до `candidate.uniqueVacancyId`, записати link з `decidedBy='auto'`, оновити агрегати UniqueVacancy (centroid, counts, mergedSkills, salary, lastSeenAt).
   - Якщо `SOFT <= similarity < HARD` → не мерджити автоматично. Створити свою UniqueVacancy (sole member), але записати "suggested matches" як окремі рядки в `unique_vacancy_links` зі `action='suggested'` — оператор побачить підказку.
   - Якщо нічого вище SOFT → створити нову UniqueVacancy, ця Vacancy = canonical.

### Backfill

Окремий Temporal workflow / batch CLI:
1. Iterate vacancies WHERE `embedding IS NULL`, батчами по 100, через `embedVacancyActivity`.
2. Після того як усі мають embedding — itera ще раз через `resolveUniqueVacancyActivity` у детермінованому порядку (за `publishedAt ASC`), щоб старіші ставали canonical.
3. Може зайняти 10-15 хвилин для 3-4к вакансій, $0.5-1 на OpenAI API.

---

## 6. Edge-cases — обов'язково обробити

### 6.1. Оновлення опису існуючої вакансії

RSS-record з тим самим `sourceId + externalId`, але новий опис → Vacancy update → `embeddingSourceHash` змінився.

Послідовність:
1. Перерахувати embedding.
2. Перевірити, чи Vacancy все ще "своя" в поточній UniqueVacancy:
   - Порахувати cosine similarity між новим embedding і `centroidEmbedding` UniqueVacancy.
   - Якщо `>= HARD_THRESHOLD` → залишити в групі, оновити агрегати, додати `unique_vacancy_links` запис з `action='reconfirmed'`.
   - Якщо `< SOFT_THRESHOLD` → **drift**:
     - Якщо `manualOverride=true` у поточної UniqueVacancy → залишити, не зачіпати, лише записати warning у links.
     - Інакше — відсоплити (`uniqueVacancyId = null`), запустити re-resolve як нову.
     - Якщо була canonical → перевибрати canonical серед решти членів групи (наступна за `publishedAt`), перерахувати centroid.
   - Якщо `SOFT <= sim < HARD` → залишити в групі, але додати warning.

**Чому так:** при оновленні опису головне не зламати UI стабільність ("вчора вона була тут — а сьогодні в іншій групі без видимої причини"). Drift вирішуємо тільки при сильній зміні.

### 6.2. Unmerge оператором

Оператор у UI каже "ця Vacancy не дубль":
1. `vacancy.uniqueVacancyId = null`.
2. Записати в blocklist пари (this vacancy, every other vacancy in former group).
3. Запустити для цієї Vacancy `resolveUniqueVacancyActivity` — або вона знайде іншу групу (не в blocklist), або стане canonical нової.
4. Якщо була canonical у попередній групі — перевибрати canonical серед решти, перерахувати centroid/агрегати. Якщо в групі лишилась 1 Vacancy — group все одно валідна (просто sole-member).
5. Записати запис у `unique_vacancy_links` з `action='unlinked'`, `decidedBy='operator'`.
6. Поточна UniqueVacancy позначається `manualOverride=true` — щоб автоматика не покрутила її назад при наступному apdate. (Обговорюване рішення — узгодити.)

### 6.3. Manual merge (оператор каже "це дубль")

UI: вибрати дві UniqueVacancy → "об'єднати":
1. Вибрати "вижилу" групу (старішу за `firstSeenAt`).
2. Перемістити всі Vacancy зливаної групи в вижилу: оновити `uniqueVacancyId`.
3. Перерахувати centroid, mergedSkills, salary, counts.
4. Видалити зливану UniqueVacancy.
5. Записати links з `action='manual_merge'`.
6. Прибрати з blocklist відповідні пари (вони більше не "заборонені").

### 6.4. Колізія pre-filter

Нова Vacancy дає >=HARD similarity з кількома кандидатами з **різних** UniqueVacancy.
- Стратегія: приєднати до тієї, де `centroidEmbedding` найближчий (найвища similarity з centroid, не з конкретного кандидата).
- Опціонально записати suggestion на manual merge тих груп.

### 6.5. Канонічна вакансія archived

Якщо canonical Vacancy переходить у `archived` (зник з джерела довго):
- Перевибрати canonical серед активних членів групи (next earliest).
- Якщо всі archived → UniqueVacancy.status = archived, не показується в публічній стрічці.

### 6.6. Idempotency

- Embed-активність ідемпотентна за `embeddingSourceHash + embeddingModel`.
- Resolve-активність ідемпотентна за `(vacancyId, embeddingSourceHash, uniqueVacancyId)` — якщо стан не змінився, нічого не робити.
- Будь-яке оновлення `unique_vacancies` — у транзакції з оновленням Vacancy.

---

## 7. Фронтенд (дашборд оператора)

### 7.1. Сторінка `/operator/unique-vacancies`

Список UniqueVacancy з фільтрами:
- Стандартні фільтри стрічки (role, seniority, workFormat).
- `sourceCount >= 2` — показати тільки cross-source дублі (це **зірковий вью для захисту**).
- `manualOverride=true` — групи з ручним втручанням.

Картка групи: canonical title, agregated company (якщо є), salary range, `sourceCount` (значок "2 джерела"), `vacancyCount`, лінк "переглянути групу".

### 7.2. Сторінка `/operator/unique-vacancies/:id`

- Шапка: canonical title, company, salary, posted (firstSeen-lastSeen), список джерел (badges).
- **Учасники групи** — список Vacancy:
  - source (Djinni/DOU), URL до оригіналу, publishedAt, статус canonical/member/archived.
  - similarity to centroid.
  - кнопки: "переглянути опис" (модалка з raw description), "розмерджити" (unmerge).
- **Why merged** (з `unique_vacancy_links`):
  - Кому з ким збіглося, similarity, які pre-filter поля match-нулись, ким прийнято (auto/operator), коли.
- **Suggested matches** (links зі `action='suggested'`):
  - Список вакансій під SOFT_THRESHOLD з кнопкою "приєднати"/"відхилити" (відхилити → у blocklist).
- **Diff descriptions** (опціонально, для wow-ефекту на захисті): side-by-side двох описів з підсвіткою спільних N-грамів.

### 7.3. Сторінка `/operator/dedup-metrics`

- Скільки UniqueVacancy всього, скільки cross-source.
- Гістограма similarity-розподілу автоматичних merge-рішень.
- Скільки manual override-ів.
- Скільки suggested → confirmed vs rejected.
- (Опційно) precision/recall на ручно розміченому golden set — якщо є час зробити 50-100 пар.

### 7.4. Публічна стрічка вакансій

Перевести стрічку з показу `Vacancy` на показ `UniqueVacancy`:
- картка тепер показує "доступно на N платформах" з лінками на оригінали.
- фільтри працюють по агрегованих полях UniqueVacancy.

**Open question:** чи перевозимо публічну стрічку зразу на UniqueVacancy, чи лишаємо подвійний режим (Vacancy + опційно UniqueVacancy) на час стабілізації? Узгодити.

---

## 8. Тести (Jest)

Мінімальний набір, що демонструє коректність:

1. **embedVacancyActivity**: повторний виклик з тим самим хешем — не дзвонить OpenAI, не оновлює `embeddingGeneratedAt`.
2. **resolveUniqueVacancyActivity — нова вакансія, нема кандидатів** → створено нову UniqueVacancy, ця Vacancy canonical, link `action='canonical_assigned'`.
3. **resolveUniqueVacancyActivity — є кандидат >HARD з іншого джерела** → приєднано, link `action='linked'`, sourceCount=2.
4. **resolveUniqueVacancyActivity — кандидат >HARD з ТОГО Ж джерела** → ігнорується, створено нову.
5. **resolveUniqueVacancyActivity — кандидат у blocklist** → ігнорується.
6. **Update flow — drift нижче SOFT** → відсоплена від групи, новий resolve.
7. **Update flow — drift у межах SOFT-HARD** → залишається, warning в links.
8. **Unmerge** → uniqueVacancyId стає null, пари у blocklist, canonical перевибрана.
9. **Manual merge двох груп** → одна група вижила, друга видалена, всі Vacancy перенесені, centroid перерахований.
10. **Pre-filter** — date window, same-source exclusion, null-safe company.

Зовнішні залежності (OpenAI API) мокаються через існуючу інфраструктуру заглушок.

---

## 9. Defendability — що показуємо комісії

На захисті потрібно мати готовим:

1. **Live дашборд** з прикладом cross-source групи (Djinni + DOU про ту саму позицію) — найкраще знайти 2-3 переконливі реальні приклади і "зберегти" їх для демо.
2. **"Why merged" блок** для конкретного прикладу — пояснює, що рішення обґрунтоване (similarity score + pre-filter поля).
3. **Метрики**: загальна кількість груп, % cross-source, розподіл similarity.
4. **Manual unmerge → re-resolve** — демонструє operator-loop і Human-in-the-Loop підхід.
5. **Слайд або фрагмент 3-розділу** з блок-схемою: pre-filter → ANN → threshold → decision. + HNSW-діаграма (вже є в звіті практики, рис. 1.2).
6. **Формула** cosine similarity і поріг 0.85/0.92 (узгоджуються зі звітом практики — там 0.88-0.92, можна підтвердити чи відкоригувати після калібрування).

---

## 10. Параметри для калібрування (виносимо в config)

```
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
HARD_THRESHOLD=0.92
SOFT_THRESHOLD=0.85
PREFILTER_DATE_WINDOW_DAYS=14
PREFILTER_TOP_N=50
HNSW_M=16
HNSW_EF_CONSTRUCTION=64
HNSW_EF_SEARCH=40
```

Стартові значення — з гіпотез і досвіду літератури (HNSW Малков-Яшунін). **Калібрувати** на 20-30 ручно перевірених парах ПЕРЕД фіксацією у звіті практики. Метод: розмітити ~30 пар (10 явні дублі, 10 явно різні, 10 межові), збудувати ROC, вибрати поріг де precision >= 0.95.

---

## 11. Узгодити (open questions для агента)

**Перш ніж писати код, узгодь з користувачем рішення по цих пунктах:**

1. **Що embeddити:** raw RSS-опис чи post-LLM нормалізований текст? Конкатенація яких полів?
2. **Embedding-модель:** `text-embedding-3-small` (1536d, дешева) vs `text-embedding-3-large` (3072d, дорожча, точніша)?
3. **Канонічний embedding для UniqueVacancy:** centroid (mean) чи embedding canonical Vacancy? Centroid стабільніший проти drift, canonical простіше пояснити.
4. **Що робити з UniqueVacancy після unmerge** — встановлювати `manualOverride=true` для всієї групи чи тільки для конкретних пар у blocklist? (Запропоновано друге — м'якший варіант.)
5. **Pre-filter за датою**: 14 днів — нормальне вікно? Якщо джерело публікує оголошення з затримкою — може треба ширше.
6. **Публічна стрічка**: переключаємо одразу на UniqueVacancy чи робимо feature flag?
7. **Колонка `sourceId` у Vacancy** — це FK на `sources`-таблицю чи enum? Це впливає на pre-filter SQL.
8. **Чи зберігати suggested matches** як рядки в `unique_vacancy_links` (з action='suggested') чи окрема таблиця `dedup_suggestions`? Запропоновано перший варіант для простоти.
9. **Backfill стратегія**: один великий Temporal workflow з child workflows на batches, чи звичайний batch-script через `pnpm` CLI? Що ближче до архітектури проекту?
10. **Roll-out для існуючих 3-4к вакансій**: пускаємо resolve в детермінованому порядку (за `publishedAt`), щоб результат був reproducible? Так — інакше при повторному прогоні canonical-и будуть різні.

---

## 12. Послідовність робіт (запропонована — узгодити)

День 1: схема БД (міграції Drizzle), HNSW індекс, embed-активність, інтеграція в існуючий ETL-флоу. Smoke test на 5-10 вакансіях.

День 2: resolve-активність (pre-filter + ANN + threshold logic), unique_vacancies + unique_vacancy_links таблиці заповнюються коректно. Backfill для 3-4к. Калібрування порогу на руч-розмічених парах.

День 3: edge-cases (update, unmerge, manual merge), blocklist, тести.

День 4: operator UI (`/unique-vacancies` + detail page + dedup-metrics). Перевід публічної стрічки.

День 5 (буфер): полірування демо, написання підрозділу 3.6.X у тексті 3 розділу диплома, рисунок з блок-схемою.

---

## 13. Контекст по типах витягнутих полів (з користувача)

LLM-парсер віддає у `ExtractedVacancy` ці поля (саме вони доступні для pre-filter):

```typescript
{
  role, seniority, skills: {required, optional}, experienceYears,
  salary: {min, max, currency}, englishLevel, employmentType,
  workFormat, locations, domain, engagementType,
  companyName,  // нестабільне, бо Djinni не віддає
  hasTestAssignment, hasReservation
}
```

Для pre-filter використовуємо в порядку зменшення надійності: `publishedAt` (date window), `sourceId` (виключення same-source), `role` (нормалізований), `seniority`, `workFormat`. `companyName` — як bonus тільки коли є з обох сторін. Salary, english, skills — у scoring можна додати в майбутньому, для MVP не критично.