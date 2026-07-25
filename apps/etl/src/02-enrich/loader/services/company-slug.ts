// Company slugs are the resolve-or-create key: `slugify(name)` decides whether an
// incoming employer is an existing row or a new one. The previous version stripped
// every non-ASCII character with no fallback, so any name written entirely in
// Cyrillic slugified to "" — and because companies.slug is UNIQUE and lookup is by
// slug, all of them collapsed into a single company row. It also made the slug
// falsy, which the feed DTO read as "no company at all".

// Simplified Ukrainian/Russian romanisation. Not KMU 55:2010 — a slug needs to be
// deterministic and readable, not standards-compliant.
const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  ё: "e",
  ы: "y",
  э: "e",
  ъ: "",
};

function romanise(input: string): string {
  return input.replace(/[Ѐ-ӿ]/g, (ch) => TRANSLIT[ch] ?? "");
}

/** Deterministic 8-hex digest, for names with nothing romanisable in them. */
function digest(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function slugifyCompany(input: string): string {
  const name = input.trim();
  const slug = romanise(name.toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Never empty: an empty slug merges unrelated employers into one row.
  return slug || `company-${digest(name.toLowerCase())}`;
}
