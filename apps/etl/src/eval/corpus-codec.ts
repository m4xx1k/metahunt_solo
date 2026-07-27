import { gunzipSync, gzipSync } from "node:zlib";

// Obfuscation, NOT encryption — the key sits next to the data. Keeps verbatim
// DOU/Djinni postings out of crawlers and code search, nothing more.
const KEY = Buffer.from("metahunt-golden-set-v1");
// Without a marker, a changed key or pipeline surfaces as zlib's "incorrect header
// check" against the committed corpus instead of naming the actual problem.
const PREFIX = "g1:";

function xor(buf: Buffer): Buffer {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i += 1) out[i] = buf[i] ^ KEY[i % KEY.length];
  return out;
}

export function encodeText(text: string): string {
  return PREFIX + xor(gzipSync(Buffer.from(text, "utf8"), { level: 9 })).toString("base64");
}

export function decodeText(blob: string): string {
  if (!blob.startsWith(PREFIX)) {
    throw new Error(`corpus entry is not ${PREFIX} format — regenerate with golden:sample`);
  }
  return gunzipSync(xor(Buffer.from(blob.slice(PREFIX.length), "base64"))).toString("utf8");
}
