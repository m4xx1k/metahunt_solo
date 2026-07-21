export function corsOrigin(webBaseUrl: string): string {
  return new URL(webBaseUrl).origin;
}
