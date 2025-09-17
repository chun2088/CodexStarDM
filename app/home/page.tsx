import type { Metadata } from "next";

import { HomeRedirect } from "./_components/home-redirect";

export const metadata: Metadata = {
  title: "Role home",
};

export default function HomeRouterPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-200 px-4 py-16 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <HomeRedirect />
    </main>
  );
}
