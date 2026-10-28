import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user.ts";
import { getDatabase, listConversationsForUser, listMessages, createConversation, findConversationById } from "@/server/db/database.ts";
import { ChatWorkspace } from "@/components/ChatWorkspace";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "employee") redirect("/console");
  const db = getDatabase();
  const storedHistory = listConversationsForUser(db, user.id);
  const existingConversation = storedHistory.find((item) => item.state === "agent");
  const conversation = existingConversation ?? createConversation(db, user.id);
  const history = existingConversation ? storedHistory : [conversation, ...storedHistory];
  const initial = { conversation: findConversationById(db, conversation.id)!, messages: listMessages(db, conversation.id) };
  const agentMode = process.env.NEXO_AGENT_MODE === "mastra" && process.env.OPENAI_API_KEY ? "mastra" : "local";
  return <ChatWorkspace user={user} agentMode={agentMode} initial={initial} history={history} />;
}
