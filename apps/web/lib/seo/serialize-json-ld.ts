// Escape `<` before the payload reaches the DOM: JSON.stringify does not, and what
// we embed includes scraped vacancy HTML, where a literal </script> would break out.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
