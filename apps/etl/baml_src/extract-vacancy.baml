// Vacancy extraction — single source of truth for the extracted shape.
// The TS type ExtractedVacancy is generated from this file into
// apps/etl/src/baml_client/types.ts; consumers import it from there.

// ============== Enums ==============

enum Seniority {
  INTERN
  JUNIOR
  MIDDLE
  SENIOR
  LEAD
  PRINCIPAL
  C_LEVEL
}

enum WorkFormat {
  REMOTE
  OFFICE
  HYBRID
}

enum EmploymentType {
  FULL_TIME
  PART_TIME
  CONTRACT
  FREELANCE
  INTERNSHIP
}

enum EnglishLevel {
  BEGINNER
  INTERMEDIATE
  UPPER_INTERMEDIATE
  ADVANCED
  NATIVE
}

enum Currency {
  USD
  EUR
  UAH
}

enum EngagementType {
  PRODUCT
  OUTSOURCE
  OUTSTAFF
  STARTUP
  AGENCY
}

// ============== Nested classes ==============

class ExtractedLocation {
  city string @description(#"
    City name in English. Don't translate proper names inaccurately.
    Examples: "Kyiv", "Lviv", "Warsaw", "Berlin".
  "#)
  country string @description(#"
    Country name in English inferred from city.
    Examples: "Ukraine", "Poland", "Germany".
  "#)
}

class Skills {
  required string[] @description(#"
    Must-have hard technical skills from the Requirements section.
    Languages (TypeScript, Go), frameworks (React, NestJS),
    databases (PostgreSQL), cloud (AWS). MAX 10 entries.
    Use canonical names as commonly written in the Ukrainian IT market.

    EXCLUDE:
      - Soft skills (communication, leadership, ownership, problem solving).
      - Generic categories (networking, scripting, relational databases,
        web testing, ai tools, technical documentation).
      - Process methodologies (Scrum, Agile, SDLC, STLC, unit testing,
        integration testing, regression testing).
      - Universal protocols / formats (HTTP, JSON, XML, REST as a concept).
        DO extract specific tools like Postman or named REST frameworks.
      - Tools every developer uses (git, terminal, IDE).

    DEDUPLICATE: if a skill appears in two forms (react + react.js,
    node + node.js, javascript + js), output ONE — the form most commonly
    used in the Ukrainian IT market (React, Node.js, JavaScript).
  "#)
  optional string[] @description(#"
    Nice-to-have / "would be a plus" skills. Same EXCLUDE / DEDUPLICATE
    rules as required. MAX 5 entries.
  "#)
}

class Salary {
  min float? @description("Minimum monthly salary in stated currency. null if not specified.")
  max float? @description("Maximum monthly salary in stated currency. null if not specified.")
  currency Currency? @description(#"
    Currency code. Generic "$" defaults to USD. null if no salary info at all.
  "#)
}

// ============== Top-level vacancy ==============

class ExtractedVacancy {
  role string? @description(#"
    Canonical developer role WITHOUT seniority prefix.
    Examples: "Frontend Developer", "Backend Developer", "DevOps Engineer",
    "QA Engineer", "Data Engineer", "ML Engineer", "Mobile Developer".

    PREFER umbrella roles over hyper-specific ones:
      "Senior React Developer"     → "Frontend Developer"
      "Python / Django Engineer"   → "Backend Developer"
      "Node.js Full Stack"         → "Full Stack Developer"
      "iOS Engineer"               → "Mobile Developer (iOS)"
      "SRE / Platform Engineer"    → "DevOps Engineer"

    If a canonical name from the prompt's `knownRoles` list fits — use it
    with EXACT spelling, do not invent variants. If genuinely niche with
    no umbrella fit, use a clear role name.
    null only if the posting is not a software / tech job at all.
  "#)

  seniority Seniority? @description(#"
    Seniority level inferred from title or requirements.
    Rules:
      1. If the title contains Junior / Middle / Senior / Lead / Architect /
         "Head of", the TITLE wins over the body text.
      2. "Architect" → PRINCIPAL.
      3. "Head of" / "VP" → C_LEVEL or LEAD depending on context.
      4. If not explicit and cannot be inferred from years of experience → null.
  "#)

  skills Skills @description(#"
    Hard technical skills ONLY.
    EXCLUDE: soft skills, methodologies (Scrum/Agile), domain knowledge,
    certifications. Each entry is a single skill name.
  "#)

  experienceYears float? @description(#"
    Minimum required commercial experience in full years.
    Rules:
      1. "3+ years" → 3.
      2. Range "3-5 years" → use LOWER bound (3).
      3. "No experience required" → 0.
      4. Not explicitly mentioned → null.
  "#)

  salary Salary? @description(#"
    Monthly salary range. Rules:
      1. If posting says "yearly" / "per year", DIVIDE by 12.
      2. Ignore gross/net distinction.
      3. null if salary is not mentioned at all.
      4. Numeric guardrail: if min or max falls outside the plausible
         monthly range of 100..50000 USD-equivalent, set BOTH min and
         max to null.
  "#)

  englishLevel EnglishLevel? @description(#"
    Mapping:
      A1/A2 → BEGINNER, B1 → INTERMEDIATE, B2 → UPPER_INTERMEDIATE,
      C1/C2 → ADVANCED, native speaker → NATIVE.
    null if not mentioned.
  "#)

  employmentType EmploymentType? @description(#"
    FULL_TIME | PART_TIME | CONTRACT | FREELANCE | INTERNSHIP.
    null if not specified.
  "#)

  workFormat WorkFormat? @description(#"
    Work location policy.
      "Remote" → REMOTE
      "Office" / "On-site" → OFFICE
      "Hybrid" / "Flexible" (mix of office and remote) → HYBRID
    null if not stated.
  "#)

  locations ExtractedLocation[] @description(#"
    Office or hub locations as {city, country}.
    Empty [] if fully remote with no specific office.
    Include all mentioned cities.
  "#)

  domain string? @description(#"
    Business domain in 1-2 words.
    Examples: "Fintech", "E-commerce", "Gambling", "HealthTech",
    "EdTech", "AdTech", "GameDev", "Logistics".

    If a canonical name from the prompt's `knownDomains` list fits — use
    it with EXACT spelling.

    NOT a domain — return null instead:
      - Tech stacks (DevOps, Microservices, Web Development, Cloud).
      - Generic terms (Industrial, Deep Tech, Recruitment, Web Dev).
      - Roles dressed as domains (Software Development, Engineering).
      - Ukrainian tax regimes ("Дія Сіті" / "Diia City").
    null if not stated.
  "#)

  engagementType EngagementType? @description(#"
    Company / engagement model:
      PRODUCT    — own product
      OUTSOURCE  — project agency
      OUTSTAFF   — body-leasing
      STARTUP    — early-stage product
      AGENCY     — creative / marketing agency
    Infer from company description. null if unclear.
  "#)

  companyName string? @description(#"
    Company name as posted. null if not stated or anonymized.
  "#)

  hasTestAssignment bool? @description(#"
    True if the posting mentions a test task, technical assignment,
    take-home, or coding challenge during the interview process.
    False if it explicitly says no test. null if not addressed at all.
  "#)

  hasReservation bool? @description(#"
    True if the posting explicitly mentions "бронь" / "бронювання" /
    military reservation as an employer benefit (UA-specific).
    null if not mentioned.
  "#)
}

// ============== Function ==============

function ExtractVacancy(
  text: string,
  knownRoles: string,
  knownDomains: string,
) -> ExtractedVacancy {
  client OpenAIClient
  prompt #"
    You extract structured data from job postings for the Ukrainian IT market.
    Read the posting and produce a value matching the schema below.
    Follow each field's description literally. Use null when uncertain
    rather than guessing.

    Context — Ukrainian IT market specifics:
      - Postings are mixed-language (Ukrainian + Russian + English).
        Translate skill / role names to English; keep canonical English forms.
      - "Бронь" / "бронювання" → military reservation benefit (hasReservation).
      - "ФОП" → contractor (sole-proprietor) employment, not a domain.
      - "Дія Сіті" / "Diia City" → Ukrainian tax regime, not a domain.
      - Salary is usually monthly in USD. A bare "$" defaults to USD / month.

    PREFER these canonical ROLE names. Use the EXACT spelling when applicable.
    If none fit, use a clear role name; do NOT invent variant spellings.
    Canonical roles:
    {{ knownRoles }}

    PREFER these canonical DOMAIN names. Use null if no good fit. Do NOT
    use tech stacks (e.g. "DevOps", "Microservices") as a domain.
    Canonical domains:
    {{ knownDomains }}

    Example
      Input: "Senior React Developer at Bolt fintech, $5k-7k/mo, remote.
              Must know TypeScript, GraphQL is a plus."
      Output:
        role: "Frontend Developer"          ← umbrella, NOT "React Developer"
        seniority: SENIOR
        skills.required: ["React", "TypeScript"]   ← NOT ["React.js"]
        skills.optional: ["GraphQL"]
        domain: "Fintech"
        salary: { min: 5000, max: 7000, currency: USD }
        workFormat: REMOTE
        companyName: "Bolt"

    Counter-example — DO NOT output:
        role: "React Developer"            ← too specific, use "Frontend Developer"
        skills.required: ["Communication"] ← soft skill, exclude
        skills.required: ["HTTP", "JSON"]  ← universal protocols, exclude
        skills.required: ["Unit Testing"]  ← process / methodology, exclude
        skills.required: ["react.js"]      ← deduped form, use "React"
        domain: "Web Development"          ← tech stack, not a business domain
        domain: "Software Development"     ← role-as-domain, use null

    {{ ctx.output_format }}

    Posting:
    {{ text }}
  "#
}

test senior_backend_remote {
  functions [ExtractVacancy]
  args {
    text #"
      Senior Backend Developer (Node.js / TypeScript) at Bolt (fintech, product company).
      Remote-only. $6000-$8000 / month. 3+ years of experience required.
      English: B2 or higher. Must know PostgreSQL and AWS. Docker is a plus.
      Test assignment provided. Бронь надається.
    "#
    knownRoles "Backend Developer, Frontend Developer, Full Stack Developer, DevOps Engineer, QA Engineer"
    knownDomains "Fintech, E-commerce, HealthTech, GameDev"
  }
}

// Real DOU.ua RSS item, captured 2026-04-24. Mirrors the input shape that
// RssExtractActivity feeds the extractor: "Title: <title>\n\n<description>"
// with HTML entities decoded. Used both here for `baml-cli test` and
// re-exported as a TS fixture in src/extraction/__fixtures__/.
test dou_fullstack_talanovyti {
  functions [ExtractVacancy]
  args {
    text #"
      Title: Senior Full Stack JS Engineer в talanovyti agency, віддалено

      <p>Привіт! Ми, <b>talanovyti</b> — рекрутингова агенція від FRACTAL, шукаємо <b>Senior Full Stack JS Engineer</b> у <b>NineTwoThree AI Studio</b> — продуктову AI-агенцію з Бостона.</p><p>Якщо ти Senior інженер, який хоче працювати з AI-продуктами та будувати технічні рішення, — давай знайомитись 🙌</p><p><b>Про компанію:</b></p><p>AI-агенція, заснована у 2012 році в Бостоні, яка створює web і mobile продукти з використанням штучного інтелекту для стартапів і великих міжнародних компаній. При цьому не компанія не працює з доменами на кшталт gambling, adult entertainment чи crypto.</p><p><b>Масштаб і досягнення:</b></p><ul><li>50+ експертів у команді: інженери, дизайнери та продуктові спеціалісти.</li><li>150+ реалізованих проєктів для клієнтів по всьому світу (здебільшого США, але тайм-зона — українська).</li><li>14 запущених стартапів — продукти, створені разом із клієнтами з нуля.</li></ul><p>Серед нагород: компанія п'ять разів поспіль потрапляла до списку Inc. 5000, визнана агентством № 1 у Бостоні, а також отримала численні нагороди Clutch у категоріях AI, ML та чатбот-компаній.</p><p>Серед клієнтів: FanDuel, Consumer Reports, Experian, SimpliSafe та інші.</p><p><b>Чому ця роль варта уваги?</b></p><ol><li><b>Різні продукти та домени.</b> Ти не «застрягаєш» в одному продукті на роки. Проєкти тривають <nobr>3–6 місяців,</nobr> після чого ти переходиш на нові з іншими задачами, доменами і технічними викликами.</li><li><b>Фокус на інженерії, а не на зустрічах з клієнтами. </b>Основна комунікація з клієнтом через PM-а, тому ти можеш концентруватися на технічних рішеннях, архітектурі та якості коду. </li><li><b>Сильна інженерна культура. </b>Команда з <nobr>8-ми</nobr> досвідчених fullstack інженерів (команда розширюється), регулярні технічні синки, buddy на перші 3 місяці для швидкої адаптації, code review і підтримка від tech lead.</li><li><b>Стабільна компанія з ростом </b>— 13 років на ринку, 5 років у Inc 5000 і стабільне зростання ~20% щороку. Це поєднання стартап-динаміки та стабільності.</li><li><b>Самостійність і реальний вплив. </b>Ти працюєш як solution owner: приймаєш технічні рішення, впливаєш на архітектуру і відповідаєш за результат. Без мікроменеджменту, але з високим рівнем довіри.</li><li><b>Робота з AI у продакшені.</b> Тут ти працюєш із реальними AI-рішеннями, які використовуються бізнесом: автоматизація процесів, робота з великими обсягами даних, інтелектуальні продукти. Це не pet-проєкти і не демо — це системи, які приносять результат клієнтам.</li></ol><p><b>Що ми шукаємо в тобі:</b></p><ol><li>5+ років досвіду у FullStack розробці (React, Node.js, JavaScript, TypeScript).</li><li>Глибоке розуміння JavaScript / TypeScript (не лише використання, а принципи роботи).</li><li>Досвід роботи з реляційними та NoSQL базами даних (PostgreSQL, MySQL, Redis).</li><li>Проєктування та реалізація RESTful API.</li><li>Досвід роботи з OAuth / SSO (SAML).</li><li>Практичний досвід роботи з microservices архітектурою.</li><li>Розуміння design patterns та best practices у розробці.</li><li>Досвід роботи з cloud-платформами (AWS / GCP / Azure).</li><li>Досвід повного циклу розробки (від ідеї до продакшену).</li><li>Вміння декомпозувати складні технічні задачі.</li></ol><p>*<i>А ще дуже важлива англійська (B2+) щоб могти пояснювати технічні рішення і підтримувати робочу комунікацію в міжнаролдній команді.</i></p><p><b>А також Soft Skills:</b></p><ol><li>Ownership — ти не просто виконуєш задачі, а відповідаєш за рішення і фінальний результат.</li><li>Проактивність — пропонуєш рішення і підходи, а не чекаєш, поки їх «принесуть».</li><li>Лідерство — слідкуєш за якістю коду і допомагаєш команді рухатись вперед до цілей.</li><li>Гнучкість — можеш підлаштуватись під роботу з міжнародною командою (інколи мітинги з US).</li><li>Увага до якості — важливі code style, best practices і чиста архітектура.</li></ol><p><b>Задачі на цій позиції:</b></p><ol><li>Розробка fullstack рішень (React + Node.js). Реалізація функціоналу як на frontend, так і на backend, з урахуванням якості та масштабованості.</li><li>Проєктування технічних рішень та архітектури. Побудова архітектури систем, вибір підходів та застосування best practices і design patterns.</li><li>Робота з AI-powered продуктами. Участь у створенні продуктів із використанням AI, інтеграція відповідних рішень у систему.</li><li>Комунікація з клієнтом і командою. Пояснення технічних рішень, варіантів реалізації, trade-offs, вартості та термінів як внутрішній команді, так і клієнту.</li><li>Декомпозиція складних задач. Розбиття складних технічних проблем на зрозумілі етапи та задачі для реалізації.</li><li>Лідерство у виконанні (execution leadership). Забезпечення якості виконання, рух проєкту вперед, контроль за тим, щоб команда дотримувалась стандартів.</li><li>Менторинг та підтримка інженерів. Допомога менш досвідченим розробникам, рев'ю коду, підтримка якості та стандартів.</li><li>Робота з бекендом та API. Проєктування і реалізація REST API, робота з аутентифікацією (OAuth / SSO).</li><li>Робота з базами даних. Використання реляційних та NoSQL баз (PostgreSQL, MySQL, Redis тощо).</li><li>Робота з cloud-інфраструктурою. Використання AWS / GCP / Azure для розгортання та підтримки продуктів.</li></ol><h3><b>Що компанія запропонує тобі:</b></h3><ol><li>Оплачувана відпустка: 20 робочих днів на рік протягом перших 3 років роботи з подальшим збільшенням до 25 днів.</li><li>Оплачувані лікарняні та вихідні: 10 державних свят та 2 додаткові вихідні дні компанії.</li><li>Well-being бюджет на підтримку фізичного та ментального здоров'я.</li><li>Професійний розвиток: компенсація навчання, курсів і сертифікацій (до 100%).</li><li>Допомога з бухгалтерією для ФОП.</li><li>Надання необхідної техніки під задачі.</li><li>buddy на перші 3 місяці для швидкої адаптації та постійна підтримка від tech lead.</li></ol><p><b>Формат роботи:</b></p><ol><li>Remote first.</li><li>Європейські робочі години <nobr>(9:00–18:00).</nobr></li></ol><p><i>*У виняткових випадках можливі вечірні мітинги з американськими клієнтами <nobr>(17:00–18:00</nobr> за європейським часом), але це не є регулярною практикою для фулстек-інженерів.</i></p><ol><li>Тайм-трекер — використовується Harvest для фіксації робочого часу:</li></ol><ul><li>без скріншотів і контролю екрану;</li><li>не потрібно ставити на паузу через короткі перерви (кава, перекур, просто відпочити/переключитись);</li><li>фокус на адекватному трекінгу робочого часу, а не мікроконтролі.</li></ul><h3><b>Hiring Process:</b></h3><ol><li>Скринінг та співбесіда з рекрутером talanovyti. </li><li>Інтервʼю з HR-командою (частково англійською): про досвід, формат роботи, очікування та загальний фіт.</li><li>Технічне інтерв'ю (Q&A) та обговорення твого досвіду: стек, архітектура, підходи до розробки, як приймаєш рішення.</li><li>Практичне завдання (hands-on session) — реальна технічна задача, наближена до роботи.</li><li>Фінальне інтервʼю з CTO (опційно) про підхід до рішень, мислення та фіт у команду.</li><li>І ось <b>оффер</b> вже у тебе «в кишені» :)</li></ol><p>Якщо ти читаєш це і ловиш себе на думці «це дійсно про мене», відгукуйся. Ми з радістю познайомимось і розкажемо більше 💛 </p><p>Або якщо бачиш в цій ролі когось зі знайомих — будемо вдячні за рекомендацію. Реферальний бонус після проходження випробувального терміну.</p>
    "#
    knownRoles "Backend Developer, Frontend Developer, Full Stack Developer, DevOps Engineer, QA Engineer, Mobile Developer, Data Engineer, ML Engineer"
    knownDomains "Fintech, E-commerce, HealthTech, GameDev, EdTech, AdTech, Logistics"
  }
}
