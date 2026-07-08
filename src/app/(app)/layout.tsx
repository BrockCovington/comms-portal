import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { IconRail } from "@/components/IconRail";
import { NotificationToasts } from "@/components/NotificationToasts";
import { getChannelsWithUnread } from "@/lib/channels";
import { getDmThreadsForUser } from "@/lib/dms";
import { getThreadsForUser } from "@/lib/threads";
import { getSavedMessagesForUser } from "@/lib/saved";
import { getDraftsForUser } from "@/lib/drafts";
import { getFilesForUser } from "@/lib/files";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative auth boundary. Every page under (app) passes through here.
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const userId = session.user.id;
  const [channelsWithUnread, dmThreads, threads, savedMessages, drafts, files] = await Promise.all([
    getChannelsWithUnread(userId),
    getDmThreadsForUser(userId),
    getThreadsForUser(userId),
    getSavedMessagesForUser(userId),
    getDraftsForUser(userId),
    getFilesForUser(userId),
  ]);
  const user = {
    name: session.user.name ?? session.user.email ?? "You",
    image: session.user.image ?? null,
  };

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <>
      <AppShell
        topBar={<TopBar user={user} />}
        rail={
          <IconRail
            workspaceName={process.env.NEXT_PUBLIC_WORKSPACE_NAME ?? "Workspace"}
            currentUserId={userId}
            user={user}
            signOutAction={handleSignOut}
          />
        }
        sidebar={
          <Sidebar
            channels={channelsWithUnread}
            dmThreads={dmThreads}
            threads={threads}
            savedMessages={savedMessages}
            drafts={drafts}
            files={files}
            currentUserId={userId}
          />
        }
      >
        {children}
      </AppShell>
      <NotificationToasts currentUserId={userId} />
    </>
  );
}
