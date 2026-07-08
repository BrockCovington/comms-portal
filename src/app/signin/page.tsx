import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/c");

  const workspace = process.env.NEXT_PUBLIC_WORKSPACE_NAME ?? "your workspace";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-rail)] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-line)] bg-white p-8 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/syndica-logo.svg" alt="Syndica" className="mb-6 h-8 w-auto" />
        <h1 className="text-xl font-semibold text-[var(--color-ink)]">
          Sign in to {workspace}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Use your company Google account. Outside accounts can&apos;t get in.
        </p>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/c" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-rail)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <GoogleGlyph />
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
