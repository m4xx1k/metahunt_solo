// LLM clients for the metahunt ETL.

// Extraction runs on DeepSeek's official API (OpenAI-compatible endpoint).
// `thinking` is disabled: deepseek-v4-flash emits reasoning tokens by default,
// which inflate output cost + latency with no quality gain for structured
// extraction (verified against the official API, 2026-07-05).
client<llm> DeepSeekClient {
  provider openai-generic
  options {
    base_url "https://api.deepseek.com"
    model env.DEEPSEEK_MODEL
    api_key env.DEEPSEEK_API_KEY
    thinking {
      type "disabled"
    }
  }
}

// Retained for the dedup confirm-tier (gpt-5-nano); no longer used by extraction.
client<llm> OpenAIClient {
  provider openai
  options {
    model env.OPENAI_MODEL
    api_key env.OPENAI_API_KEY
  }
}
