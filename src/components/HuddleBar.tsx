"use client";

import { useEffect, useRef, useState } from "react";
import {
  useParticipants,
  useLocalParticipant,
  useTracks,
  useIsSpeaking,
  VideoTrack,
  MediaDeviceSelect,
} from "@livekit/components-react";
import {
  ParticipantEvent,
  Track,
  type LocalAudioTrack,
  type LocalParticipant,
  type LocalTrackPublication,
  type Participant,
} from "livekit-client";
import type { TrackReference } from "@livekit/components-core";
import type { KrispNoiseFilterProcessor } from "@livekit/krisp-noise-filter";
import type { HuddleParticipant, HuddleFloatingReaction } from "@/hooks/useHuddleRoster";
import { decodeParticipantImage } from "@/lib/huddle";
import { EmojiPicker } from "@/components/EmojiPicker";
import { EmojiToken } from "@/components/EmojiToken";

function initials(name: string | null): string {
  return (name ?? "?").charAt(0).toUpperCase();
}

// Krisp's ML-based noise suppression (same category of model Zoom/Slack use)
// runs as a client-side track processor on the local mic — no server-side
// involvement, no LiveKit Cloud account needed. Loaded via a dynamic
// import() rather than a top-level one: the package's own JS (before its
// ML model, which it fetches separately at runtime) is multiple MB, and a
// static import would bundle that into every channel page's initial load
// just for the "Start huddle" button, whether or not anyone ever huddles.
// Attached via a LocalTrackPublished listener (not just on mount) because
// the underlying MediaStreamTrack gets replaced — and the processor with
// it — every time the mic is muted/unmuted or the input device is
// switched; watching the publish event covers all three cases instead of
// just the initial one.
function useNoiseFilter(localParticipant: LocalParticipant) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // The generic TrackProcessor interface (what track.getProcessor() returns)
  // doesn't expose setEnabled — that's specific to KrispNoiseFilterProcessor
  // — so the live instance is kept here directly instead of round-tripping
  // through the track each time the toggle changes.
  const processorRef = useRef<KrispNoiseFilterProcessor | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    import("@livekit/krisp-noise-filter").then(({ KrispNoiseFilter, isKrispNoiseFilterSupported }) => {
      if (cancelled || !isKrispNoiseFilterSupported()) return;
      setSupported(true);

      function attach(pub: LocalTrackPublication) {
        if (pub.source !== Track.Source.Microphone || !pub.track) return;
        const processor = KrispNoiseFilter();
        (pub.track as LocalAudioTrack)
          .setProcessor(processor)
          .then(() => {
            processorRef.current = processor;
            processor.setEnabled(enabledRef.current);
          })
          .catch((err) => {
            // Surfaced (not swallowed) so a genuine attach failure is
            // diagnosable — huddle audio still works, just unfiltered.
            console.warn("Noise filter failed to attach:", err);
          });
      }

      const existing = localParticipant.getTrackPublication(Track.Source.Microphone);
      if (existing) attach(existing);
      localParticipant.on(ParticipantEvent.LocalTrackPublished, attach);
      unsubscribeRef.current = () => localParticipant.off(ParticipantEvent.LocalTrackPublished, attach);
    });

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      processorRef.current = null;
    };
  }, [localParticipant]);

  function setEnabled(next: boolean) {
    setEnabledState(next);
    processorRef.current?.setEnabled(next);
  }

  return { supported, enabled, setEnabled };
}

const TILE_SIZE_MIN = 96;
const TILE_SIZE_MAX = 320;
const TILE_SIZE_STEP = 32;
const TILE_SIZE_DEFAULT = 128;

// A small drag handle for the video area's bottom-right corner. Uses
// Pointer Capture so it keeps receiving move/up events even once the
// cursor leaves its small hitbox mid-drag, without a document listener.
function ResizeHandle({
  tileSize,
  setTileSize,
}: {
  tileSize: number;
  setTileSize: (size: number) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; startSize: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startSize: tileSize };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const { startX, startY, startSize } = dragRef.current;
    // Average of horizontal + vertical movement — a natural feel for a
    // bottom-right corner handle, where dragging down-right grows it.
    const delta = (e.clientX - startX + (e.clientY - startY)) / 2;
    setTileSize(Math.min(TILE_SIZE_MAX, Math.max(TILE_SIZE_MIN, Math.round(startSize + delta))));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="slider"
      aria-label="Drag to resize video"
      aria-valuemin={TILE_SIZE_MIN}
      aria-valuemax={TILE_SIZE_MAX}
      aria-valuenow={tileSize}
      title="Drag to resize"
      className="absolute bottom-0 right-0 z-10 flex h-6 w-6 cursor-nwse-resize touch-none items-center justify-center rounded-tl text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
    >
      ⤡
    </div>
  );
}

// One tile per participant, whether or not they're joined yet:
//  - an active camera track renders as live video
//  - otherwise their real profile photo (carried in LiveKit participant
//    metadata — see src/lib/huddle.ts — so it's available the moment
//    they're in the roster, not just once they're actually connected)
//  - a bare initial only if neither exists
function HuddleTile({
  name,
  image,
  trackRef,
  isSpeaking,
  size,
  pixelSize,
}: {
  name: string | null;
  image: string | null;
  trackRef?: TrackReference;
  isSpeaking?: boolean;
  size: "sm" | "lg";
  // Only used when size === "lg" — the small pre-join avatars stay a fixed
  // size, but in-call tiles scale continuously via the zoom controls.
  pixelSize?: number;
}) {
  const style = size === "lg" ? { width: pixelSize ?? TILE_SIZE_DEFAULT, height: pixelSize ?? TILE_SIZE_DEFAULT } : undefined;
  return (
    <div
      title={name ?? undefined}
      style={style}
      className={`relative shrink-0 overflow-hidden rounded-lg border-2 bg-[var(--color-accent-soft)] ${
        size === "sm" ? "h-9 w-9" : ""
      } ${isSpeaking ? "border-[var(--color-accent)]" : "border-transparent"}`}
    >
      {trackRef ? (
        <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" />
      ) : image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name ?? "Participant"} className="h-full w-full object-cover" />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center font-semibold text-[var(--color-accent)] ${
            size === "lg" ? "text-3xl" : "text-xs"
          }`}
        >
          {initials(name)}
        </div>
      )}
      {size === "lg" && (
        <span className="absolute bottom-1 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
          {name || "Someone"}
        </span>
      )}
    </div>
  );
}

// Wraps HuddleTile for a live LiveKit participant — useIsSpeaking is a hook,
// so it needs its own component rather than being called in a .map().
function LiveHuddleTile({
  participant,
  trackRef,
  pixelSize,
}: {
  participant: Participant;
  trackRef?: TrackReference;
  pixelSize: number;
}) {
  const isSpeaking = useIsSpeaking(participant);
  return (
    <HuddleTile
      name={participant.name || null}
      image={decodeParticipantImage(participant.metadata)}
      trackRef={trackRef}
      isSpeaking={isSpeaking}
      size="lg"
      pixelSize={pixelSize}
    />
  );
}

// The one large "main stage" tile for whoever's sharing their screen —
// screen content needs real estate, unlike the small square participant
// tiles, so this renders above them instead of alongside. Scales with the
// same zoom control as the participant tiles, off the same default ratio.
function ScreenShareStage({ trackRef, tileSize }: { trackRef: TrackReference; tileSize: number }) {
  const maxWidth = 672 * (tileSize / TILE_SIZE_DEFAULT);
  return (
    <div
      style={{ maxWidth }}
      className="mx-auto mb-3 w-full overflow-hidden rounded-lg border border-[var(--color-line)] bg-black"
    >
      <div className="aspect-video">
        <VideoTrack trackRef={trackRef} className="h-full w-full object-contain" />
      </div>
      <p className="bg-black/80 px-2 py-1 text-center text-xs text-white">
        {trackRef.participant.name || "Someone"} is sharing their screen
      </p>
    </div>
  );
}

// Rises and fades over ~2s via a mount-triggered class flip — no keyframes
// or extra CSS assets needed, just a Tailwind transition.
function FloatingReactionItem({ emoji }: { emoji: string }) {
  const [risen, setRisen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRisen(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span
      className={`text-3xl transition-all duration-[2000ms] ease-out ${
        risen ? "-translate-y-10 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <EmojiToken token={emoji} imgClassName="inline-block h-8 w-8 object-contain" />
    </span>
  );
}

function ControlButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${
        active
          ? "bg-[var(--color-accent)] text-white hover:opacity-90"
          : "bg-[var(--color-accent-soft)] text-[var(--color-ink-soft)] hover:opacity-80"
      }`}
    >
      {children}
    </button>
  );
}

function NoteInput({
  channelId,
  onSendNote,
}: {
  channelId: string;
  onSendNote: (body: string, attachmentIds?: string[]) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<
    { key: string; fileName: string; status: "uploading" | "done" | "error"; id?: string } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const key = crypto.randomUUID();
    setAttachment({ key, fileName: file.name, status: "uploading" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/channels/${channelId}/files`, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAttachment({ key, fileName: file.name, status: "done", id: data.attachment.id });
    } catch {
      setAttachment({ key, fileName: file.name, status: "error" });
    }
  }

  async function submit() {
    const body = value.trim();
    const attachmentIds = attachment?.status === "done" && attachment.id ? [attachment.id] : undefined;
    if ((!body && !attachmentIds) || sending || attachment?.status === "uploading") return;
    setSending(true);
    setError(null);
    try {
      await onSendNote(body, attachmentIds);
      setValue("");
      setAttachment(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
      {attachment && (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
          {attachment.status === "uploading" && <span>Uploading {attachment.fileName}…</span>}
          {attachment.status === "error" && <span className="text-red-600">Upload failed</span>}
          {attachment.status === "done" && <span>📎 {attachment.fileName}</span>}
          <button onClick={() => setAttachment(null)} className="hover:text-[var(--color-accent)]">
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFile}
          className="hidden"
          disabled={!!attachment}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!attachment}
          aria-label="Attach a file"
          title="Attach a file"
          className="shrink-0 rounded p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)] disabled:opacity-40"
        >
          📎
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Drop a note, link or file"
          className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={submit}
          disabled={sending || attachment?.status === "uploading" || (!value.trim() && !attachment)}
          aria-label="Send note"
          className="shrink-0 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          ➤
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function HuddleControls({
  channelId,
  channelName,
  reactions,
  onLeave,
  onSendReaction,
  onSendNote,
  onOpenChannel,
}: {
  channelId: string;
  channelName: string;
  reactions: HuddleFloatingReaction[];
  onLeave: () => void;
  onSendReaction: (emoji: string) => void;
  onSendNote: (body: string, attachmentIds?: string[]) => Promise<void>;
  // When set (the global dock), a header button jumps to the channel without
  // tearing down the huddle.
  onOpenChannel?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tileSize, setTileSize] = useState(TILE_SIZE_DEFAULT);
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const noiseFilter = useNoiseFilter(localParticipant);
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div className="flex items-center gap-2 bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white">
        <span>🎧</span>
        <span className="min-w-0 flex-1 truncate">Huddle in {channelName}</span>
        {onOpenChannel && (
          <button
            onClick={onOpenChannel}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-white/90 hover:bg-white/20"
            title="Open channel"
          >
            Open ↗
          </button>
        )}
      </div>
      <div className="relative bg-[var(--color-accent-soft)]/40 p-4">
        <FloatingReactions reactions={reactions} />

        <div className="mb-2 flex items-center justify-end gap-1">
          <button
            onClick={() => setTileSize((s) => Math.max(TILE_SIZE_MIN, s - TILE_SIZE_STEP))}
            disabled={tileSize <= TILE_SIZE_MIN}
            aria-label="Shrink video"
            title="Shrink video"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] disabled:opacity-30"
          >
            −
          </button>
          <button
            onClick={() => setTileSize((s) => Math.min(TILE_SIZE_MAX, s + TILE_SIZE_STEP))}
            disabled={tileSize >= TILE_SIZE_MAX}
            aria-label="Enlarge video"
            title="Enlarge video"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] disabled:opacity-30"
          >
            +
          </button>
        </div>

        <div className="relative rounded-md pb-2 pr-2">
          {screenTracks.length > 0 && (
            <ScreenShareStage trackRef={screenTracks[0]} tileSize={tileSize} />
          )}

          <div className="flex flex-wrap justify-center gap-3">
            {participants.map((p) => (
              <LiveHuddleTile
                key={p.identity}
                participant={p}
                trackRef={cameraTracks.find((t) => t.participant.identity === p.identity)}
                pixelSize={tileSize}
              />
            ))}
          </div>

          <ResizeHandle tileSize={tileSize} setTileSize={setTileSize} />
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <ControlButton
            active={isMicrophoneEnabled}
            onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {})}
            label={isMicrophoneEnabled ? "Mute" : "Unmute"}
          >
            {isMicrophoneEnabled ? "🎙️" : "🔇"}
          </ControlButton>
          <ControlButton
            active={isCameraEnabled}
            onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled).catch(() => {})}
            label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            {isCameraEnabled ? "📹" : "📷"}
          </ControlButton>
          <ControlButton
            active={isScreenShareEnabled}
            onClick={() => localParticipant.setScreenShareEnabled(!isScreenShareEnabled).catch(() => {})}
            label={isScreenShareEnabled ? "Stop sharing" : "Share screen"}
          >
            🖥️
          </ControlButton>
          <div className="relative">
            <ControlButton active={pickerOpen} onClick={() => setPickerOpen((v) => !v)} label="React">
              😀
            </ControlButton>
            {pickerOpen && (
              <EmojiPicker
                onPick={(emoji) => onSendReaction(emoji)}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
          <div className="relative">
            <ControlButton active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} label="Settings">
              ⚙️
            </ControlButton>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} />
                {/* Opens upward into the video area: the huddle container is
                    overflow-hidden, so a downward panel gets clipped at its
                    bottom edge (and by the composer below). */}
                <div className="absolute bottom-full right-0 z-50 mb-1 max-h-[70vh] w-56 overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-left shadow-lg">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    Microphone
                  </p>
                  <MediaDeviceSelect kind="audioinput" className="mb-2 text-sm" />
                  {noiseFilter.supported && (
                    <label className="mb-2 flex items-center gap-2 px-1 text-sm text-[var(--color-ink)]">
                      <input
                        type="checkbox"
                        checked={noiseFilter.enabled}
                        onChange={(e) => noiseFilter.setEnabled(e.target.checked)}
                      />
                      Suppress background noise
                    </label>
                  )}
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    Camera
                  </p>
                  <MediaDeviceSelect kind="videoinput" className="text-sm" />
                </div>
              </>
            )}
          </div>
          <button
            onClick={onLeave}
            className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Leave
          </button>
        </div>
      </div>
      <NoteInput channelId={channelId} onSendNote={onSendNote} />
    </div>
  );
}

function FloatingReactions({ reactions }: { reactions: HuddleFloatingReaction[] }) {
  if (reactions.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1 z-10 flex flex-wrap justify-center gap-2">
      {reactions.map((r) => (
        <FloatingReactionItem key={r.key} emoji={r.emoji} />
      ))}
    </div>
  );
}

export function WaitingAvatars({ participants }: { participants: HuddleParticipant[] }) {
  return (
    <div className="flex -space-x-2">
      {participants.slice(0, 5).map((p) => (
        <div key={p.id} className="rounded-full ring-2 ring-white">
          <HuddleTile name={p.name} image={p.image} size="sm" />
        </div>
      ))}
    </div>
  );
}

