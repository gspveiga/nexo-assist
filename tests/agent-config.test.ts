import test from "node:test";
import assert from "node:assert/strict";
import { defaultLlmModel, getAgentMode } from "../src/server/agent/config.ts";

test("selects GPT through Mastra only when its OpenAI key is configured", () => {
  const previous = {
    mode: process.env.NEXO_AGENT_MODE,
    model: process.env.NEXO_LLM_MODEL,
    openAiKey: process.env.OPENAI_API_KEY,
  };

  try {
    process.env.NEXO_AGENT_MODE = "mastra";
    process.env.NEXO_LLM_MODEL = defaultLlmModel;
    delete process.env.OPENAI_API_KEY;
    assert.equal(getAgentMode(), "local");

    process.env.OPENAI_API_KEY = "test-key";
    assert.equal(getAgentMode(), "mastra");

    process.env.NEXO_AGENT_MODE = "local";
    assert.equal(getAgentMode(), "local");
  } finally {
    if (previous.mode === undefined) delete process.env.NEXO_AGENT_MODE;
    else process.env.NEXO_AGENT_MODE = previous.mode;
    if (previous.model === undefined) delete process.env.NEXO_LLM_MODEL;
    else process.env.NEXO_LLM_MODEL = previous.model;
    if (previous.openAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.openAiKey;
  }
});
