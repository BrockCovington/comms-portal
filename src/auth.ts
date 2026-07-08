import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase();

// Emails that should land as ADMIN the moment they first sign in, before
// their User row even exists. Comma-separated, case-insensitive.
const AUTO_ADMIN_EMAILS = new Set(
  (process.env.AUTO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Database sessions are revocable (delete the Session row to kill a session).
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  providers: [
    Google({
      authorization: {
        params: {
          // "hd" asks Google's chooser to prefer your Workspace domain. It is
          // only a HINT — it can be bypassed, so we re-check on the server below.
          hd: process.env.ALLOWED_EMAIL_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    // The authoritative organization lock. Runs on every sign-in attempt.
    async signIn({ profile }) {
      // Fail closed: if the domain isn't configured, nobody gets in.
      if (!ALLOWED_DOMAIN) {
        console.error("ALLOWED_EMAIL_DOMAIN is not set — rejecting all logins.");
        return false;
      }

      // Google's profile carries email_verified + hd; type them locally.
      const g = profile as
        | { email?: string; email_verified?: boolean; hd?: string }
        | undefined;

      const email = g?.email?.toLowerCase();
      const emailVerified = g?.email_verified === true;
      // Google sets "hd" (hosted domain) on Workspace accounts.
      const hd = g?.hd?.toLowerCase();

      if (!email || !emailVerified) return false;

      const emailDomainOk = email.endsWith(`@${ALLOWED_DOMAIN}`);
      // If Google provides hd it must match; personal gmail accounts have no hd.
      const hdOk = hd ? hd === ALLOWED_DOMAIN : true;

      return emailDomainOk && hdOk;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
  events: {
    // Fires exactly once, right after the adapter inserts a brand-new User
    // row on someone's very first successful sign-in (already past the
    // domain-lock check above). No pre-created rows involved — pre-creating
    // a User with this email ahead of time would risk NextAuth's
    // OAuthAccountNotLinked error on their actual first Google sign-in.
    async createUser({ user }) {
      if (user.email && AUTO_ADMIN_EMAILS.has(user.email.toLowerCase())) {
        await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      }
    },
  },
});
