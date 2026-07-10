import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// OpenAI accepts up to 2048 inputs per /v1/embeddings call; we stay
// conservatively under that so a single failure doesn't waste a big
// batch. 100 ≈ ~25k tokens at our description length — well within the
// 8191-tokens-per-input limit and the org TPM ceiling.
const DEFAULT_BATCH_SIZE = 100;

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

interface OpenAIEmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

@Injectable()
export class OpenAIEmbeddingsClient {
  private readonly logger = new Logger(OpenAIEmbeddingsClient.name);
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    const key = config.get<string>("OPENAI_API_KEY") ?? "";
    if (key.length === 0) {
      throw new Error("OPENAI_API_KEY is empty — required for the dedup embedding pipeline");
    }
    this.apiKey = key;
  }

  get model(): string {
    return EMBEDDING_MODEL;
  }

  /**
   * Embeds `inputs` in one or more batches and returns vectors in the
   * SAME order as inputs. Caller is responsible for matching each
   * vector back to its vacancy.
   */
  async embed(inputs: string[], batchSize: number = DEFAULT_BATCH_SIZE): Promise<number[][]> {
    if (inputs.length === 0) return [];

    const out: number[][] = new Array<number[]>(inputs.length);
    for (let i = 0; i < inputs.length; i += batchSize) {
      const chunk = inputs.slice(i, i + batchSize);
      const vectors = await this.embedBatch(chunk);
      for (let j = 0; j < vectors.length; j++) {
        out[i + j] = vectors[j];
      }
    }
    return out;
  }

  private async embedBatch(chunk: string[]): Promise<number[][]> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: chunk,
            encoding_format: "float",
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
            await sleep(backoffMs(attempt, res.headers.get("retry-after")));
            continue;
          }
          throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 500)}`);
        }

        const json = (await res.json()) as OpenAIEmbeddingResponse;
        // The API guarantees data[].index matches input position, but
        // it's not guaranteed to be returned in order — sort defensively.
        const ordered: number[][] = new Array<number[]>(chunk.length);
        for (const item of json.data) {
          ordered[item.index] = item.embedding;
        }
        return ordered;
      } catch (err) {
        lastError = err;
        if (attempt >= MAX_RETRIES) break;
        // Network errors (fetch throws) — same backoff.
        this.logger.warn(`embed batch attempt ${attempt + 1} failed: ${(err as Error).message}`);
        await sleep(backoffMs(attempt, null));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("OpenAI embeddings failed after retries");
  }
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  // Exponential backoff with small jitter — 500, 1000, 2000, 4000, 8000 ms.
  return BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
