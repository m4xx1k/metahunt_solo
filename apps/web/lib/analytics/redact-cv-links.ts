// The shareable ?cv=<uuid> is a bearer capability: anyone holding the URL holds
// the CV. It has to be scrubbed from every URL-shaped property, including the
// `$initial_*` ones posthog-js writes with $set_once — those are not event
// properties, they land on the person profile and stay there.
const CV_PARAM = /([?&]cv=)[^&#]+/gi;

function redactValue(value: unknown): unknown {
  return typeof value === "string" ? value.replace(CV_PARAM, "$1redacted") : value;
}

/** Mutates and returns the property bag posthog-js is about to send. */
export function redactCvLinks(properties: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(properties)) {
    const value = properties[key];
    // $set / $set_once bags: one level of nesting, values that outlive the event.
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of Object.keys(nested))
        nested[nestedKey] = redactValue(nested[nestedKey]);
      continue;
    }
    properties[key] = redactValue(value);
  }
  return properties;
}
