import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  description: "You're currently viewing cached content while offline.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-center text-slate-50">
      <h1 className="text-3xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-lg text-sm text-slate-300">
        A cached version of the site is available thanks to the service worker. Your changes will sync automatically when a
        connection is restored.
      </p>
      <Link
        href="/"
        className="rounded-full bg-white px-5 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white"
      >
        Try the app again
      </Link>
    </main>
  );
}
