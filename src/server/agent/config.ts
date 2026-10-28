export const defaultLlmModel = "ollama/qwen3:4b";
export const defaultOllamaBaseUrl = "http://127.0.0.1:11434/api";

export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || defaultOllamaBaseUrl;
}

export function isLocalOllamaEndpoint(baseUrl = getOllamaBaseUrl()): boolean {
  try {
    const parsed = new URL(baseUrl);
    return parsed.hostname === "127.0.0.1"
      || parsed.hostname === "localhost"
      || parsed.hostname === "::1"
      || parsed.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function getOllamaModelId(): string {
  const configuredModel = (process.env.NEXO_LLM_MODEL ?? defaultLlmModel).trim();
  const [provider, ...modelParts] = configuredModel.split("/");
  if (provider !== "ollama" || modelParts.length === 0 || !modelParts.join("/").trim()) {
    throw new Error("NEXO_LLM_MODEL deve usar o formato ollama/<modelo>, por exemplo ollama/qwen3:4b.");
  }
  return modelParts.join("/").trim();
}

export function getAgentMode(): "local" | "mastra" {
  if (process.env.NEXO_AGENT_MODE !== "mastra") return "local";
  if (process.env.VERCEL && isLocalOllamaEndpoint()) return "local";
  try {
    getOllamaModelId();
    return "mastra";
  } catch {
    return "local";
  }
}

export function getAgentStatusLabel(): string {
  if (getAgentMode() !== "mastra") return "Roteador local";
  return isLocalOllamaEndpoint() ? "Mastra · Ollama local" : "Mastra · Ollama";
}
