"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { useAuth } from "@/lib/auth-context";
import { useNavigation } from "@/lib/navigation-context";
import { DEMO_USERS } from "@/lib/demo-users";
import { useQuery } from "@tanstack/react-query";

const fetchWelcomeMessage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return {
    message:
      "TanStack Query is configured. This message is cached for five minutes to keep subsequent renders fast.",
  };
};

export function HomeDashboard() {
  const { user, login, logout } = useAuth();
  const { resolveHomePath } = useNavigation();
  const { data, isFetching } = useQuery({
    queryKey: ["welcome-message"],
    queryFn: fetchWelcomeMessage,
  });

  const isAuthenticated = Boolean(user);
  const homePath = resolveHomePath();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="rounded-3xl border border-black/10 bg-white/80 p-8 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/60">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Starter Kit</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
          Codex Star DM Progressive Web App
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-600 dark:text-slate-300">
          Explore an App Router based Next.js project that comes with offline-first PWA support, TanStack Query for
          server state, and a lightweight auth context for session data. Start building on top of an opinionated yet
          flexible foundation.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-2xl border border-transparent bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
          <h2 className="text-xl font-semibold">Offline-ready PWA</h2>
          <p className="mt-3 text-sm text-slate-200">
            Manifest metadata and a generated service worker provide installability. Core routes, assets, and API calls are
            cached automatically so the app keeps working without a network connection.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-100">
            <li>• Custom runtime caching for pages, assets, media, and API routes</li>
            <li>• Offline fallback route available at <code className="rounded bg-black/40 px-1">/offline</code></li>
            <li>• Automatic updates with skip waiting enabled</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Server state via TanStack Query</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Queries are cached for five minutes and opt out of refetching on window focus for predictable UX.
          </p>
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
            {isFetching ? "Loading welcome message…" : data?.message}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Auth session context</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Session data is stored in a React context with optional persistence to <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">localStorage</code>.
        </p>

        <div className="mt-4 flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/70">
          <div className="space-y-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">Current user</p>
            <p className="text-lg font-medium text-slate-900 dark:text-white">
              {isAuthenticated ? user?.name : "Guest"}
            </p>
            {isAuthenticated ? (
              <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  Role: <span className="font-semibold text-slate-900 dark:text-white">{user?.role}</span>
                </p>
                {user?.email ? <p>Email: {user.email}</p> : null}
                {user?.defaultWalletId ? <p>Default wallet: {user.defaultWalletId}</p> : null}
                {user?.storeId ? <p>Store: {user.storeId}</p> : null}
                {user?.storeSubscriptionStatus ? (
                  <div className="flex items-center gap-2">
                    <span>Subscription:</span>
                    <StatusBadge status={user.storeSubscriptionStatus} />
                  </div>
                ) : null}
                <p>
                  Home route: <code className="rounded bg-slate-200 px-1 dark:bg-slate-900">{homePath}</code>
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">Use a demo account to explore role-aware routing.</p>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {DEMO_USERS.map((demoUser) => {
                const isActive = user?.id === demoUser.id;
                return (
                  <button
                    key={demoUser.id}
                    type="button"
                    onClick={() => login(demoUser)}
                    className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500"
                    }`}
                  >
                    <p className="font-semibold">{demoUser.name}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {demoUser.role}
                    </p>
                    {demoUser.storeSubscriptionStatus ? (
                      <div className="mt-2">
                        <StatusBadge status={demoUser.storeSubscriptionStatus} />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="inline-flex w-max items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
              onClick={logout}
              disabled={!isAuthenticated}
            >
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
