export const defaultLlmModel = "ollama/qwen3:4b";
export const defaultOllamaBaseUrl = "http://127.0.0.1:11434/api";

export function getOllamaModelId(): string {
  const configuredModel = process.env.NEXO_LLM_MODEL ?? defaultLlmModel;
  const [provider, ...modelParts] = configuredModel.split("/");
  if (provider !== "ollama" || modelParts.length === 0 || !modelParts.join("/").trim()) {
    throw new Error("NEXO_LLM_MODEL deve usar o formato ollama/<modelo>, por exemplo ollama/qwen3:4b.");
  }
  return modelParts.join("/");
}

export function getAgentMode(): "local" | "mastra" {
  if (process.env.NEXO_AGENT_MODE !== "mastra") return "local";
  try {
    getOllamaModelId();
    return "mastra";
  } catch {
    return "local";
  }
}
