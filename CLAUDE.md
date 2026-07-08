# comms-portal

Internal Slack-style chat app: Next.js 15 (App Router) / Prisma / NextAuth v5 / Pusher.

## Security backbone — keep these intact

- **Auth on every route.** Every API route calls `getCurrentUserId()` and, for
  anything channel-related, `checkChannelAccess()` from `src/lib/authz.ts`.
- **Message bodies are encrypted at rest.** Always write with `encryptMessage()`
  and read with `decryptMessage()` from `src/lib/crypto.ts`. Never store or log
  plaintext message bodies.
- **Real-time uses private Pusher channels.** New live features authorize
  subscriptions through `/api/pusher/auth`, which runs the same access check.
- **Secrets stay server-side.** Only genuinely public values get a
  `NEXT_PUBLIC_` prefix.
- **Schema changes need a push.** After editing `schema.prisma`, run
  `npx prisma db push` before testing.
