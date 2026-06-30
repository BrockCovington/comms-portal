import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative auth boundary. Every page under (app) passes through here.
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const userId = session.user.id;

  const channels = await prisma.channel.findMany({
    where: {
      OR: [
        { isPrivate: false, isDm: false },
        { members: { some: { userId } } },
      ],
    },
    select: { id: true, name: true, isPrivate: true, isDm: true },
    orderBy: [{ isDm: "asc" }, { name: "asc" }],
  });

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        channels={channels}
        user={{
          name: session.user.name ?? session.user.email ?? "You",
          image: session.user.image ?? null,
        }}
        workspaceName={process.env.NEXT_PUBLIC_WORKSPACE_NAME ?? "Workspace"}
        signOutAction={handleSignOut}
      />
      <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-canvas)]">
        {children}
      </main>
    </div>
  );
}
