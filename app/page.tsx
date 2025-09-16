import { HomeDashboard } from "./_components/home-dashboard";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-200 px-4 py-16 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <HomeDashboard />
    </main>
  );
}
