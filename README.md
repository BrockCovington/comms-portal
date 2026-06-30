# Comms Portal

Internal, organization-only team chat. Next.js 15 (App Router) · TypeScript ·
Prisma 6 · PostgreSQL (Neon) · NextAuth v5 (Google SSO) · Tailwind v4.

## What's in this scaffold

- **Org-locked Google sign-in.** Only verified accounts on your Google
  Workspace domain can sign in. Enforced server-side on every login.
- **Channels + messages + threading** (threads modeled in the schema; thread UI
  is a next step).
- **Encryption at rest.** Message bodies are AES-256-GCM encrypted before being
  written to the database, on top of Neon's storage-level encryption.
- **Server-side authorization** on every API route (public vs. private vs. DM).
- **Security headers** (HSTS, no-framing, nosniff, referrer/permissions policy).
- **Live updates via polling** — a placeholder to be swapped for a managed
  real-time provider (Pusher / Ably / Supabase Realtime).

> This is **not** end-to-end encrypted: the server can read messages, which is
> required for search, threads and web access. That matches how Slack works.

## Quick start

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in every value.
3. `npx prisma db push` (creates the tables in Neon)
4. `npm run dev` and open http://localhost:3000

See the chat walkthrough for the Google Cloud + Neon setup details.

## Project layout

```
src/
  auth.ts                       NextAuth v5 config (the org lock lives here)
  middleware.ts (root)          fast redirect for unauthenticated visitors
  lib/
    prisma.ts                   Prisma client singleton
    crypto.ts                   AES-256-GCM encrypt/decrypt for messages
    authz.ts                    session + channel-access checks
    validation.ts               zod input schemas
  app/
    signin/                     sign-in page
    (app)/                      authenticated shell + channel pages
    api/                        auth, channels, messages routes
  components/                   Sidebar, ChannelView, MessageList, Composer
  hooks/useMessages.ts          fetch + polling
```
