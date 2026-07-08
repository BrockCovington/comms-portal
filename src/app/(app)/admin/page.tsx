import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/AdminDashboard";

// /admin — org-management dashboard: assign roles, archive channels, remove
// members. The API routes underneath are already admin-gated (requireAdmin
// in src/lib/authz.ts); this redirect is defense in depth so the page itself
// never renders for a non-admin.
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/c");

  const [users, channels] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.channel.findMany({
      where: { isDm: false },
      select: { id: true, name: true, isPrivate: true, archivedAt: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <AdminDashboard initialUsers={users} initialChannels={channels} />;
}
