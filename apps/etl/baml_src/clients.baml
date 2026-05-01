// LLM clients for the metahunt ETL.
// Reuses the existing OPENAI_API_KEY / OPENAI_MODEL env vars.

client<llm> OpenAIClient {
  provider openai
  options {
    model env.OPENAI_MODEL
    api_key env.OPENAI_API_KEY
  }
}
