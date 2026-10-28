import test from "node:test";
import assert from "node:assert/strict";
import { defaultLlmModel, getAgentMode, getOllamaModelId } from "../src/server/agent/config.ts";

test("selects local Ollama through Mastra without an API key", () => {
  const previous = {
    mode: process.env.NEXO_AGENT_MODE,
    model: process.env.NEXO_LLM_MODEL,
  };

  try {
    process.env.NEXO_AGENT_MODE = "mastra";
    process.env.NEXO_LLM_MODEL = defaultLlmModel;
    assert.equal(getAgentMode(), "mastra");
    assert.equal(getOllamaModelId(), "qwen3:4b");

    process.env.NEXO_AGENT_MODE = "local";
    assert.equal(getAgentMode(), "local");

    process.env.NEXO_AGENT_MODE = "mastra";
    process.env.NEXO_LLM_MODEL = "openai/example-model";
    assert.equal(getAgentMode(), "local");
    assert.throws(() => getOllamaModelId(), /ollama\/<modelo>/);
  } finally {
    if (previous.mode === undefined) delete process.env.NEXO_AGENT_MODE;
    else process.env.NEXO_AGENT_MODE = previous.mode;
    if (previous.model === undefined) delete process.env.NEXO_LLM_MODEL;
    else process.env.NEXO_LLM_MODEL = previous.model;
  }
});
