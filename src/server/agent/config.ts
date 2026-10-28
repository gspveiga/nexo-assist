export const defaultLlmModel = "google/gemini-3.8-flash";

const providerApiKeyEnvironment: Record<string, string> = {
  google: "GOOGLE_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  xai: "XAI_API_KEY",
};

export function getAgentMode(): "local" | "mastra" {
  if (process.env.NEXO_AGENT_MODE !== "mastra") return "local";

  const model = process.env.NEXO_LLM_MODEL ?? defaultLlmModel;
  const provider = model.split("/", 1)[0];
  const apiKeyName = providerApiKeyEnvironment[provider];
  return apiKeyName && process.env[apiKeyName]?.trim() ? "mastra" : "local";
}
