/**
 * RSS descriptions arrive with HTML markup, entities, and inconsistent
 * whitespace (see `description` samples for djinni/dou). Feeding that
 * straight into an embedding model wastes tokens on tag noise and lets
 * cosmetic markup differences depress similarity between two postings
 * of the same job. The sanitizer is intentionally regex-based — pulling
 * in a parser library for this single use is overkill.
 */

const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
// Cheap stand-ins for the entities that actually appear in our data
// (sampled from real djinni/dou descriptions). Numeric/hex entities
// below catch the long tail.
const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
  "&laquo;": "«",
  "&raquo;": "»",
  "&bull;": "•",
  "&middot;": "·",
};

const NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-fA-F]+);/g;

// Conservative cap: text-embedding-3-small accepts 8191 tokens (~32k chars
// for our English/Ukrainian mix). 6000 chars is enough signal for
// similarity while keeping payloads small and predictable.
const MAX_LENGTH = 6000;

export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw;

  s = s.replace(HTML_TAG_RE, " ");

  for (const [pattern, replacement] of Object.entries(NAMED_ENTITIES)) {
    if (s.includes(pattern)) {
      s = s.split(pattern).join(replacement);
    }
  }

  s = s.replace(NUMERIC_ENTITY_RE, (_, n: string) => {
    const code = parseInt(n, 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    return String.fromCodePoint(code);
  });
  s = s.replace(HEX_ENTITY_RE, (_, n: string) => {
    const code = parseInt(n, 16);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    return String.fromCodePoint(code);
  });

  // Collapse all whitespace runs (including non-breaking, tabs, newlines)
  // into single spaces. The structure of paragraphs adds nothing to a
  // bag-of-words embedding model.
  s = s.replace(/\s+/g, " ").trim();

  if (s.length > MAX_LENGTH) s = s.slice(0, MAX_LENGTH);

  return s;
}
