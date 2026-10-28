import { requireUser } from "@/server/auth/current-user.ts";
import { errorResponse } from "@/server/api.ts";
import { getDatabase, listTickets } from "@/server/db/database.ts";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser("employee");
    return Response.json({ tickets: listTickets(getDatabase(), user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
