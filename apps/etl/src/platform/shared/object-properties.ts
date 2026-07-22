export function countObjectKeys(value: unknown): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return 0;
  return Object.keys(value).length;
}
