import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user.ts";
import { ProfileWorkspace } from "@/components/ProfileWorkspace";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "employee") redirect("/console");
  return <ProfileWorkspace user={user} />;
}
