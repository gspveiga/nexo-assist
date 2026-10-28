export const defaultLlmModel = "openai/gpt-6.1-sol";

const providerApiKeyEnvironment: Record<string, string> = {
  openai: "OPENAI_API_KEY",
};

export function getAgentMode(): "local" | "mastra" {
  if (process.env.NEXO_AGENT_MODE !== "mastra") return "local";

  const model = process.env.NEXO_LLM_MODEL ?? defaultLlmModel;
  const provider = model.split("/", 1)[0];
  const apiKeyName = providerApiKeyEnvironment[provider];
  return apiKeyName && process.env[apiKeyName]?.trim() ? "mastra" : "local";
}
