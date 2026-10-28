import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { createOllama } from "ollama-ai-provider-v2";
import { z } from "zod";
import { getOllamaBaseUrl, getOllamaModelId } from "./config.ts";
import type { Intent, IntentDecision } from "./router.ts";

const decisionSchema = z.object({
  intent: z.enum(["faq", "lookup", "update", "create", "handoff", "out_of_scope", "unknown"]),
  reason: z.string().min(1).max(120),
  confidence: z.number().min(0).max(1),
});

const routerInstructions = `
Você classifica mensagens para um service desk de TI. Retorne somente os campos do esquema.
Não responda ao funcionário, não invente artigos nem números e não afirme que uma operação foi executada.
Escreva o campo reason em uma frase curta com no máximo 12 palavras.
Escolha faq para uma pergunta técnica que possa ser respondida com a central interna; lookup para consultar chamados;
update para complementar um chamado; create para relatar uma falha ou pedir acesso/equipamento/software;
handoff somente quando a pessoa pedir explicitamente um analista ou descrever uma interrupção claramente crítica/ampla;
não transfira automaticamente só porque há uma falha ou porque a categoria é incerta. Use out_of_scope para assuntos fora de TI;
use unknown quando faltarem detalhes para escolher com segurança. A aplicação valida a decisão e executa todas as operações.
`;

let cachedKey = "";
let cachedAgent: Agent | null = null;

function getRouterAgent(): Agent {
  const baseURL = getOllamaBaseUrl();
  const modelId = getOllamaModelId();
  const apiKey = process.env.OLLAMA_API_KEY?.trim() ?? "";
  const nextKey = `${baseURL}|${modelId}|${apiKey}`;
  if (cachedAgent && cachedKey === nextKey) return cachedAgent;

  const ollama = createOllama({
    baseURL,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  const ollamaModel = ollama.chat(modelId);
  cachedAgent = new Agent({
    id: "nexo-intent-router",
    name: "Nexo Assist — roteador de intenção",
    instructions: routerInstructions,
    // Mastra adapts AI SDK v4 models at runtime. Its current public type for the
    // adapter has a conflicting doGenerate return signature, so isolate that
    // mismatch here instead of weakening the agent or response schema types.
    model: ollamaModel as unknown as MastraModelConfig,
  });
  cachedKey = nextKey;
  return cachedAgent;
}

export async function routeWithMastra(text: string, recentMessages: string[]): Promise<Omit<IntentDecision, "mode">> {
  const history = recentMessages.slice(-6).join("\n");
  const timeoutSignal = AbortSignal.timeout(30_000);
  try {
    const response = await getRouterAgent().generate(
      `Contexto recente:\n${history || "(sem histórico)"}\n\nMensagem atual:\n${text}`,
      {
        structuredOutput: { schema: decisionSchema },
        modelSettings: { temperature: 0, maxOutputTokens: 128 },
        providerOptions: {
          ollama: { think: false, options: { num_ctx: 4096, num_predict: 128, temperature: 0 } },
        },
        abortSignal: timeoutSignal,
      },
    );
    const parsed = decisionSchema.parse(response.object);
    if (timeoutSignal.aborted) throw timeoutSignal.reason;
    const ticketNumber = text.toUpperCase().match(/\b(?:INC|REQ)-\d{4,6}\b/)?.[0] ?? null;
    return { ...parsed, query: text, ticketNumber, intent: parsed.intent as Intent };
  } catch (error) {
    // Alguns provedores devolvem uma saída estruturada incompleta quando o
    // SDK aborta a geração. Preserve a causa real para a camada de serviço.
    if (timeoutSignal.aborted) throw timeoutSignal.reason;
    throw error;
  }
}
