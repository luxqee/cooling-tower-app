import { getSessionUser } from "@/lib/auth/clerk";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/sign-in");
  if (user.role === "technician") redirect("/time-tracking");
  redirect("/dashboard");
}
