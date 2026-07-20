import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { IconRail } from "@/components/IconRail";
import { QuickSwitcher } from "@/components/QuickSwitcher";
import { NotificationToasts } from "@/components/NotificationToasts";
import { IncomingHuddle } from "@/components/IncomingHuddle";
import { HuddleProvider } from "@/components/HuddleProvider";
import { CustomEmojiProvider } from "@/components/CustomEmojiContext";
import { QuickReactionsProvider } from "@/components/QuickReactionsProvider";
import { getChannelsWithUnread } from "@/lib/channels";
import { getHuddleReactions } from "@/lib/huddleReactions";
import { getChannelSections } from "@/lib/channelSections";
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
  const [channelsWithUnread, channelSections, dmThreads, threads, savedMessages, drafts, files, huddleReactions, customEmoji] =
    await Promise.all([
      getChannelsWithUnread(userId),
      getChannelSections(userId),
      getDmThreadsForUser(userId),
      getThreadsForUser(userId),
      getSavedMessagesForUser(userId),
      getDraftsForUser(userId),
      getFilesForUser(userId),
      getHuddleReactions(userId),
      prisma.customEmoji
        .findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
        // Client uses the access-checked proxy path, never the private Blob URL.
        .then((rows) => rows.map((e) => ({ id: e.id, name: e.name, url: `/api/emoji/${e.id}` }))),
    ]);
  const user = {
    name: session.user.name ?? session.user.email ?? "You",
    email: session.user.email ?? "",
    image: session.user.image ?? null,
  };

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <CustomEmojiProvider initialEmoji={customEmoji}>
      <QuickReactionsProvider initial={huddleReactions}>
      <HuddleProvider currentUserId={userId}>
        <AppShell
          topBar={<TopBar user={user} />}
          rail={
            <IconRail
              workspaceName={process.env.NEXT_PUBLIC_WORKSPACE_NAME ?? "Workspace"}
              currentUserId={userId}
              user={user}
              role={session.user.role}
              signOutAction={handleSignOut}
            />
          }
          sidebar={
            <Sidebar
              channels={channelsWithUnread}
              sections={channelSections}
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
        <QuickSwitcher />
        <NotificationToasts currentUserId={userId} />
        <IncomingHuddle currentUserId={userId} />
      </HuddleProvider>
      </QuickReactionsProvider>
    </CustomEmojiProvider>
  );
}
