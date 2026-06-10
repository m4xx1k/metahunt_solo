// Canonical key for node_aliases rows: lowercase + strip separator
// characters, so "REST Assured", "rest-assured" and "RestAssured" all
// resolve to one node. Only separators are stripped — unicode letters and
// meaningful symbols survive ("C++", "C#", "Node.js" → "nodejs"), so
// Cyrillic alias names don't collapse to an empty key. Every writer and
// reader of node_aliases.name must go through this function; migration
// 0019 re-normalized the existing rows to the same key.
export function normalizeAliasName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_./-]+/g, "");
}
