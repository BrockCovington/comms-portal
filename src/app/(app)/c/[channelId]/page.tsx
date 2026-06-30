import { notFound } from "next/navigation";
import { getCurrentUserId, checkChannelAccess } from "@/lib/authz";
import { ChannelView } from "@/components/ChannelView";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const userId = await getCurrentUserId();

  const access = await checkChannelAccess(userId, channelId);
  if (!access.ok) notFound();

  return (
    <ChannelView
      channelId={access.channel.id}
      channelName={access.channel.name}
      currentUserId={userId!}
    />
  );
}
