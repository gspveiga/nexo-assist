import test from "node:test";
import assert from "node:assert/strict";
import { defaultLlmModel, getAgentMode, getAgentStatusLabel, getOllamaModelId } from "../src/server/agent/config.ts";

test("selects local Ollama through Mastra without an API key and guards localhost on Vercel", () => {
  const previous = {
    mode: process.env.NEXO_AGENT_MODE,
    model: process.env.NEXO_LLM_MODEL,
    baseUrl: process.env.OLLAMA_BASE_URL,
    vercel: process.env.VERCEL,
  };

  try {
    delete process.env.VERCEL;
    delete process.env.OLLAMA_BASE_URL;
    process.env.NEXO_AGENT_MODE = "mastra";
    process.env.NEXO_LLM_MODEL = defaultLlmModel;
    assert.equal(getAgentMode(), "mastra");
    assert.equal(getOllamaModelId(), "qwen3:4b");
    assert.equal(getAgentStatusLabel(), "Mastra · Ollama local");

    process.env.VERCEL = "1";
    assert.equal(getAgentMode(), "local");
    assert.equal(getAgentStatusLabel(), "Roteador local");

    process.env.OLLAMA_BASE_URL = "https://ollama.com/api";
    assert.equal(getAgentMode(), "mastra");
    assert.equal(getAgentStatusLabel(), "Mastra · Ollama");

    process.env.NEXO_AGENT_MODE = "local";
    assert.equal(getAgentMode(), "local");

    delete process.env.VERCEL;
    process.env.NEXO_AGENT_MODE = "mastra";
    process.env.NEXO_LLM_MODEL = "openai/example-model";
    assert.equal(getAgentMode(), "local");
    assert.throws(() => getOllamaModelId(), /ollama\/<modelo>/);
  } finally {
    if (previous.mode === undefined) delete process.env.NEXO_AGENT_MODE;
    else process.env.NEXO_AGENT_MODE = previous.mode;
    if (previous.model === undefined) delete process.env.NEXO_LLM_MODEL;
    else process.env.NEXO_LLM_MODEL = previous.model;
    if (previous.baseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previous.baseUrl;
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
  }
});
