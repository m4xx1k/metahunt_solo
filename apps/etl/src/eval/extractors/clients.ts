import { ClientRegistry } from "@boundaryml/baml";

/**
 * Eval-only LLM clients, declared at runtime rather than in `clients.baml`.
 * `baml:identity:check` hashes that file whole, so adding a challenger there
 * would move BAML_PRODUCTION_SOURCE_HASH, hence every artifact's `spec_hash`,
 * and re-extract the entire corpus for a client production never calls.
 */
export type EvalClient = {
  /** Reported as `usage.model`, which BAML's collector cannot supply. */
  model: string;
  /** `undefined` leaves the BAML function on its declared client. */
  registry?: ClientRegistry;
};

const CLIENTS: Record<string, () => EvalClient> = {
  DeepSeekClient: () => ({ model: required("DEEPSEEK_MODEL") }),
  // Same model, reasoning left on. Production disables it for cost and latency;
  // this variant measures what that costs in extraction quality.
  DeepSeekThinkingClient: () => {
    const model = required("DEEPSEEK_MODEL");
    const registry = new ClientRegistry();
    registry.addLlmClient("DeepSeekThinkingClient", "openai-generic", {
      base_url: "https://api.deepseek.com",
      model,
      api_key: required("DEEPSEEK_API_KEY"),
    });
    registry.setPrimary("DeepSeekThinkingClient");
    return { model, registry };
  },
  OpenRouterMuseClient: () => {
    const model = required("OPENROUTER_MUSE_MODEL");
    const registry = new ClientRegistry();
    registry.addLlmClient("OpenRouterMuseClient", "openai-generic", {
      base_url: "https://openrouter.ai/api/v1",
      model,
      api_key: required("OPENROUTER_MUSE_API_KEY"),
    });
    registry.setPrimary("OpenRouterMuseClient");
    return { model, registry };
  },
};

export const CLIENT_NAMES = Object.keys(CLIENTS);

export function resolveClient(name: string): EvalClient {
  const build = CLIENTS[name];
  if (build === undefined)
    throw new Error(`unknown --client "${name}" — expected ${CLIENT_NAMES.join(" | ")}`);
  return build();
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for this client`);
  return value;
}
