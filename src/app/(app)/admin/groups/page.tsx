import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminGroups } from "@/components/AdminGroups";

// /admin/groups — create user groups and manage their members. Admin-gated
// like the rest of /admin (the underlying API also runs requireAdmin).
export default async function AdminGroupsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/c");

  const [groups, users] = await Promise.all([
    prisma.userGroup.findMany({
      orderBy: { handle: "asc" },
      select: { id: true, handle: true, name: true, members: { select: { userId: true } } },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  return (
    <AdminGroups
      initialGroups={groups.map((g) => ({ id: g.id, handle: g.handle, name: g.name, memberIds: g.members.map((m) => m.userId) }))}
      users={users}
    />
  );
}
