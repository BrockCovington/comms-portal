import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminUsers } from "@/components/AdminUsers";

// /admin/users — assign roles. API routes underneath are admin-gated
// (requireAdmin in src/lib/authz.ts); this redirect is defense in depth so the
// page never renders for a non-admin.
export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/c");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, image: true, role: true, statusEmoji: true, statusText: true, statusExpiresAt: true },
    orderBy: { name: "asc" },
  });

  return <AdminUsers initialUsers={users} />;
}
