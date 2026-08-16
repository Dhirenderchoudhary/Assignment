import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { currentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const DESCRIPTION =
  "Click as fast as you can before the clock runs out. Compete on global, daily and weekly leaderboards.";

export const metadata: Metadata = {
  // Set NEXT_PUBLIC_SITE_URL on the deployment so shared links resolve their
  // preview image against the real origin instead of localhost.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "ClickRush — the 60-second click challenge",
    template: "%s — ClickRush",
  },
  description: DESCRIPTION,
  applicationName: "ClickRush",
  openGraph: {
    type: "website",
    siteName: "ClickRush",
    title: "ClickRush — the 60-second click challenge",
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: "ClickRush", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#05060c",
  // The game surface is tap-heavy; zooming on double-tap would fight the player.
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-cyan focus:px-4 focus:py-2 focus:font-semibold focus:text-void"
        >
          Skip to content
        </a>

        <div className="flex min-h-dvh flex-col">
          <Nav user={user} />
          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6">
            {children}
          </main>
          <footer className="border-t border-border/60 py-6 text-center text-xs text-muted">
            Built with Next.js, PostgreSQL and questionable finger stamina.
          </footer>
        </div>
      </body>
    </html>
  );
}
