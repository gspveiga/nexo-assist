import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user.ts";
import { getDatabase } from "@/server/db/database.ts";
import { getConsoleQueue } from "@/server/services/console.ts";
import { ConsoleWorkspace } from "@/components/ConsoleWorkspace";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const analyst = await getCurrentUser();
  if (!analyst) redirect("/");
  if (analyst.role !== "analyst") redirect("/chat");
  return <ConsoleWorkspace analyst={analyst} initialQueue={await getConsoleQueue(await getDatabase(), analyst)} />;
}
