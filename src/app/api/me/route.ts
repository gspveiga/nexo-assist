import { getCurrentUser } from "@/server/auth/current-user.ts";
import { errorResponse } from "@/server/api.ts";
import { ServiceError } from "@/server/services/errors.ts";

export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError("Faça login para continuar.", 401, "AUTH_REQUIRED");
    const mode = process.env.NEXO_AGENT_MODE === "mastra" && process.env.OPENAI_API_KEY ? "mastra" : "local";
    return Response.json({ user, agentMode: mode });
  } catch (error) {
    return errorResponse(error);
  }
}
