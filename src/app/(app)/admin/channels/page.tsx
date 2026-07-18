import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminChannels } from "@/components/AdminChannels";

// /admin/channels — archive / unarchive channels. Admin-gated like the rest of
// /admin (the underlying archive route also runs requireAdmin).
export default async function AdminChannelsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/c");

  const channels = await prisma.channel.findMany({
    where: { isDm: false },
    select: { id: true, name: true, isPrivate: true, archivedAt: true },
    orderBy: { name: "asc" },
  });

  return <AdminChannels initialChannels={channels} />;
}
