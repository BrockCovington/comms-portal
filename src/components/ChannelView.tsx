"use client";

import { useMessages } from "@/hooks/useMessages";
import { MessageList } from "@/components/MessageList";
import { MessageComposer } from "@/components/MessageComposer";

export function ChannelView({
  channelId,
  channelName,
  currentUserId,
}: {
  channelId: string;
  channelName: string;
  currentUserId: string;
}) {
  const { messages, loading, error, sendMessage } = useMessages(channelId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-[var(--color-line)] px-5">
        <h1 className="text-base font-semibold text-[var(--color-ink)]">
          <span className="text-[var(--color-ink-soft)]">#</span> {channelName}
        </h1>
      </header>

      <MessageList
        messages={messages}
        loading={loading}
        currentUserId={currentUserId}
      />

      {error && (
        <p className="px-5 pb-1 text-xs text-red-600">{error}</p>
      )}

      <MessageComposer channelName={channelName} onSend={sendMessage} />
    </div>
  );
}
