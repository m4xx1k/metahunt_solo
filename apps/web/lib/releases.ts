// The public /releases page is generated from md/journal/releases.md so there is
// exactly one place releases are written. A hand-maintained copy would drift from
// the journal within a week.

export type ReleaseEntry = {
  /** The bullet's leading **bold** phrase, inline-rendered — titles carry markdown
   *  too ("**`/match` onboarding landing**"), so rendering it as plain text leaked
   *  literal backticks into the summary. */
  title: string;
  /** Everything after it, as inline-rendered HTML. Empty when the bullet is just a title. */
  body: string;
};

export type ReleaseDay = {
  /** ISO date from the `## ` heading. */
  date: string;
  /** The heading's trailing note, if any: "## 2026-05-03 (frontend import)". */
  note: string | null;
  entries: ReleaseEntry[];
};

const DAY_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*(.*)$/;
const TOP_BULLET = /^-\s+(.*)$/;
const NESTED_BULLET = /^\s{2,}[-*]\s+(.*)$/;
const LEADING_BOLD = /^\*\*(.+?)\*\*[.:]?\s*/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inline markdown only — bold, code, links. Runs *after* escaping, so the tags it
 * emits are the only real markup in the output and the source can't inject any.
 * Relative links (`./migrations/x.md`) lose their href: those docs aren't
 * published, so linking them would ship broken links.
 */
export function renderInline(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, text: string, href: string) => {
      const safe = href.replace(/"/g, "%22");
      return `<a href="${safe}" target="_blank" rel="nofollow noopener">${text}</a>`;
    })
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function parseReleases(markdown: string): ReleaseDay[] {
  const days: ReleaseDay[] = [];
  let current: ReleaseDay | null = null;
  // Nested bullets and wrapped prose belong to the bullet above them.
  let open: { title: string; parts: string[] } | null = null;

  const flush = () => {
    if (!open || !current) return;
    current.entries.push({
      title: renderInline(open.title),
      body: renderInline(open.parts.join(" ").trim()),
    });
    open = null;
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const heading = DAY_HEADING.exec(line);
    if (heading) {
      flush();
      current = { date: heading[1], note: heading[2].trim() || null, entries: [] };
      days.push(current);
      continue;
    }
    if (!current) continue; // the file's own preamble
    if (line.trim() === "---" || line.trim() === "") continue;

    const nested = NESTED_BULLET.exec(line);
    if (nested && open) {
      open.parts.push(nested[1]);
      continue;
    }
    const top = TOP_BULLET.exec(line);
    if (top) {
      flush();
      const bold = LEADING_BOLD.exec(top[1]);
      // No leading bold phrase: use the whole bullet as the title and collapse nothing.
      open = bold
        ? { title: bold[1], parts: [top[1].slice(bold[0].length)] }
        : { title: top[1], parts: [] };
      continue;
    }
    if (open) open.parts.push(line.trim());
  }
  flush();

  // The journal is not written in order — newest days sit on top, then it jumps
  // back to April and ascends, and 05-11 precedes 05-09. Sort it.
  return days
    .filter((d) => d.entries.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
