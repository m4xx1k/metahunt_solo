export function isITVacancy(title: string): boolean {
  const cleanTitle = title.trim();

  // 1. BLACKLIST - Блокуємо те, що точно не підходить
  for (const pattern of BLACKLIST_PATTERNS) {
    if (pattern.test(cleanTitle)) {
      return false;
    }
  }

  // 2. WHITELIST - Дозволяємо те, що виглядає як IT
  for (const pattern of WHITELIST_PATTERNS) {
    if (pattern.test(cleanTitle)) {
      return true;
    }
  }

  // 3. UNKNOWN - Все інше в смітник (Strict)
  return false;
}

/**
 * ПРАВИЛА ФІЛЬТРАЦІЇ:
 * 1. Якщо назва містить щось із BLACKLIST_PATTERNS -> Блокуємо (Stage: BLACKLIST)
 * 2. Якщо назва містить щось із WHITELIST_PATTERNS -> Пропускаємо (Stage: WHITELIST)
 * 3. Все інше -> Блокуємо (Stage: UNKNOWN)
 */

// Явно нетехнічні роі (навіть якщо згадують IT стек)
const BLACKLIST_PATTERNS = [
  // HR / Recruiting / People
  /\b(recruiter|talent|hr|human resources|people\s?partner|people\s?ops|hiring|headhunter)\b/i,

  // Marketing / SEO / PR
  /\b(marketing|media\s?buyer|seo|smm|copywriter|content|pr|brand|growth|ppc|affiliate|lead\s?gen|onboarding|creative)\b/i,

  // Sales / Customer Support / Operations
  /\b(sales|account\s?manager|bizdev|support|customer\s?success|customer\s?service|client\s?success|cs\s?payment|officer|specialist|specialist|coordinator|operations)\b/i,

  // Management
  /\b(product|project|manager|delivery|scrum|coach|office|assistant|director|chief|ceo|cfo|coo|cmo|chro|head\s?of|vp\s?of|pm|po|ba|ba)\b/i,

  // Finance / Legal / Other Admin
  /\b(lawyer|legal|accountant|finance|financial|бухгалтер|translator|teacher|trainer|labeler|бригада)\b/i,

  // Design (non-IT or borderline)
  /\b(designer|дизайнер|interior|kitchen|graphic|motion|video|photo)\b/i,

  // Non-IT Engineers
  /\b(mechanical|civil|electrical|електрик|конструктор|машинобудівник|виробництва|бригада)\b/i,
];

// Явно технічні ролі та технології
const WHITELIST_PATTERNS = [
  // Core IT Roles
  /\b(developer|engineer|programmer|coder|розробник|архітектор|architect|tech\s?lead|team\s?lead|cto|cdo)\b/i,

  // Specializations & Technical Roles
  /\b(qa|tester|quality assurance|sdet|aqa|devops|sre|reliability|sysadmin|administrator|security|cyber|pentest|infosec|software)\b/i,
  /\b(frontend|backend|fullstack|full-stack|stack|mobile)\b/i,

  // Languages & Tech Stacks
  /\b(python|java|javascript|typescript|js|ts|golang|rust|php|ruby|scala|kotlin|swift|dart|c#|c\+\+|\.net|react|angular|vue|nodejs|node\.js|next\.js|nuxt|laravel|django|spring|flutter|react\s?native|webflow|solidity|blockchain|web3|unity|unreal|godot|sql|nosql|markup|layout|html|css)\b/i,

  // Data & Infrastructure
  /\b(data scientist|data analyst|data engineer|machine learning|ml|ai|artificial|dba|database|kubernetes|docker|aws|azure|gcp|terraform|ansible|infrastructure|cloud|platform|network|integration|automation)\b/i,

  // Hardware & Embedded
  /\b(embedded|firmware|hardware|esp32|arduino|stm32)\b/i,
];

// export class VacancyFilterUtils {

//   static filterItems(
//     items: RssItem[],
//     source: string,
//   ): {
//     passed: RssItem[];
//     blocked: RssItem[];
//     passedLog: FilterLogEntry[];
//     blockedLog: FilterLogEntry[];
//   } {
//     const passed: RssItem[] = [];
//     const blocked: RssItem[] = [];
//     const passedLog: FilterLogEntry[] = [];
//     const blockedLog: FilterLogEntry[] = [];

//     for (const item of items) {
//       const result = this.isITVacancy(item.title, item.description);

//       const logEntry: FilterLogEntry = {
//         title: item.title,
//         link: item.link,
//         stage: result.stage,
//         reason: result.reason,
//         source,
//       };

//       if (result.passed) {
//         passed.push(item);
//         passedLog.push(logEntry);
//       } else {
//         blocked.push(item);
//         blockedLog.push(logEntry);
//       }
//     }

//     return { passed, blocked, passedLog, blockedLog };
//   }
// }
