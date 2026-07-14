import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { checkChannelAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { otherMemberLabel } from "@/lib/dm";
import { ChannelView } from "@/components/ChannelView";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) notFound();

  let channelName = access.channel.name;
  if (access.channel.isDm) {
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true, user: { select: { name: true, email: true } } },
    });
    channelName = otherMemberLabel(members, userId!);
  }

  const [starred, notifyPref] = await Promise.all([
    prisma.starredChannel.findUnique({
      where: { channelId_userId: { channelId, userId: userId! } },
      select: { id: true },
    }),
    prisma.channelPreference.findUnique({
      where: { userId_channelId: { userId: userId!, channelId } },
      select: { muted: true, level: true },
    }),
  ]);

  return (
    <ChannelView
      channelId={access.channel.id}
      channelName={channelName}
      isDm={access.channel.isDm}
      isPrivate={access.channel.isPrivate}
      isArchived={!!access.channel.archivedAt}
      isAdmin={session!.user.role === "ADMIN"}
      isStarred={!!starred}
      notifyMuted={notifyPref?.muted ?? false}
      notifyLevel={notifyPref?.level ?? "MENTIONS"}
      currentUserId={userId!}
    />
  );
}
