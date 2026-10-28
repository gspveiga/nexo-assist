import { requireUser } from "@/server/auth/current-user.ts";
import { errorResponse } from "@/server/api.ts";
import { getDatabase } from "@/server/db/database.ts";
import { getConsoleQueue } from "@/server/services/console.ts";

export async function GET(): Promise<Response> {
  try {
    const analyst = await requireUser("analyst");
    return Response.json({ queue: getConsoleQueue(getDatabase(), analyst) });
  } catch (error) {
    return errorResponse(error);
  }
}
