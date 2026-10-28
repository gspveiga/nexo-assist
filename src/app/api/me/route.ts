import { getCurrentUser } from "@/server/auth/current-user.ts";
import { errorResponse } from "@/server/api.ts";
import { ServiceError } from "@/server/services/errors.ts";
import { getAgentMode, getAgentStatusLabel } from "@/server/agent/config.ts";

export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ServiceError("Faça login para continuar.", 401, "AUTH_REQUIRED");
    const mode = getAgentMode();
    return Response.json({ user, agentMode: mode, agentLabel: getAgentStatusLabel() });
  } catch (error) {
    return errorResponse(error);
  }
}
