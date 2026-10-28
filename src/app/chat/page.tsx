import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user.ts";
import { getDatabase, listConversationsForUser, listMessages, createConversation, findConversationById } from "@/server/db/database.ts";
import { getAgentMode, getAgentStatusLabel } from "@/server/agent/config.ts";
import { ChatWorkspace } from "@/components/ChatWorkspace";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "employee") redirect("/console");
  const db = await getDatabase();
  const storedHistory = await listConversationsForUser(db, user.id);
  const existingConversation = storedHistory.find((item) => item.state === "agent");
  const conversation = existingConversation ?? await createConversation(db, user.id);
  const history = existingConversation ? storedHistory : [conversation, ...storedHistory];
  const initial = { conversation: (await findConversationById(db, conversation.id))!, messages: await listMessages(db, conversation.id) };
  const agentMode = getAgentMode();
  const agentLabel = getAgentStatusLabel();
  return <ChatWorkspace user={user} agentMode={agentMode} agentLabel={agentLabel} initial={initial} history={history} />;
}
