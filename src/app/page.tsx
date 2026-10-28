import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user.ts";
import { LoginScreen } from "@/components/LoginScreen";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "analyst" ? "/console" : "/chat");
  return <LoginScreen />;
}
