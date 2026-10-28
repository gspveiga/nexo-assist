import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { defaultLlmModel } from "./config.ts";
import type { Intent, IntentDecision } from "./router.ts";

const decisionSchema = z.object({
  intent: z.enum(["faq", "lookup", "update", "create", "handoff", "out_of_scope", "unknown"]),
  query: z.string().max(1000),
  ticketNumber: z.string().nullable(),
  reason: z.string().min(1).max(220),
  confidence: z.number().min(0).max(1),
});

const routerAgent = new Agent({
  id: "nexo-intent-router",
  name: "Nexo Assist — roteador de intenção",
  instructions: `
Você classifica mensagens para um service desk de TI. Retorne somente os campos do esquema.
Não responda ao funcionário, não invente artigos nem números e não afirme que uma operação foi executada.
Escolha faq para uma pergunta técnica que possa ser respondida com a central interna; lookup para consultar chamados;
update para complementar um chamado; create para relatar uma falha ou pedir acesso/equipamento/software;
handoff quando a pessoa pede analista ou descreve uma falha geral/crítica; out_of_scope para assuntos fora de TI;
unknown quando não houver informação suficiente. A aplicação valida a decisão e executa todas as operações.
`,
  model: process.env.NEXO_LLM_MODEL ?? defaultLlmModel,
});

export async function routeWithMastra(text: string, recentMessages: string[]): Promise<Omit<IntentDecision, "mode">> {
  const history = recentMessages.slice(-6).join("\n");
  const timeoutSignal = AbortSignal.timeout(15_000);
  try {
    const response = await routerAgent.generate(
      `Contexto recente:\n${history || "(sem histórico)"}\n\nMensagem atual:\n${text}`,
      { structuredOutput: { schema: decisionSchema }, abortSignal: timeoutSignal },
    );
    const parsed = decisionSchema.parse(response.object);
    if (timeoutSignal.aborted) throw timeoutSignal.reason;
    return { ...parsed, intent: parsed.intent as Intent };
  } catch (error) {
    // Alguns provedores devolvem uma saída estruturada incompleta quando o
    // SDK aborta a geração. Preserve a causa real para a camada de serviço.
    if (timeoutSignal.aborted) throw timeoutSignal.reason;
    throw error;
  }
}
