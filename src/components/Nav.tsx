"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@/lib/auth";
import { post } from "@/lib/client";

// Profile only appears once there is one; signed out it just bounces to /login.
const LINKS = [
  { href: "/", label: "Play", authOnly: false },
  { href: "/leaderboard", label: "Leaderboard", authOnly: false },
  { href: "/profile", label: "Profile", authOnly: true },
];

export function Nav({ user }: { user: AuthUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await post("/api/auth/logout");
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-void/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-5xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="group flex items-center gap-2 font-bold tracking-tight">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-cyan to-violet text-sm font-black text-void transition-transform group-hover:scale-110"
          >
            CR
          </span>
          <span className="hidden text-gradient sm:inline">ClickRush</span>
        </Link>

        <ul className="flex flex-1 items-center gap-1 text-sm">
          {LINKS.filter((link) => user || !link.authOnly).map(({ href, label }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-lg px-2.5 py-1.5 transition-colors sm:px-3 ${
                    active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">
              @<span className="text-ink">{user.username}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger/60 hover:text-danger disabled:opacity-50"
            >
              {signingOut ? "…" : "Sign out"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-gradient-to-r from-cyan to-violet px-3 py-1.5 text-sm font-semibold text-void transition-transform hover:scale-105"
            >
              Sign up
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
