"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { DEMO_USERS } from "@/lib/demo-users";
import { useNavigation } from "@/lib/navigation-context";
import { useMutation } from "@tanstack/react-query";

type MagicLinkResponse = {
  email: string;
  magicLink: string;
  expiresIn: number;
  redirectTo: string | null;
  userId: string | null;
};

export function LoginView() {
  const { user, login, logout } = useAuth();
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [redirectTo, setRedirectTo] = useState("/home");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [magicLink, setMagicLink] = useState<MagicLinkResponse | null>(null);

  const mutation = useMutation<MagicLinkResponse, ApiError, { email: string; redirectTo?: string | null }>({
    mutationFn: async ({ email: targetEmail, redirectTo: redirect }) => {
      const response = await fetch("/api/auth/magiclink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, redirectTo: redirect }),
      });

      return parseJsonResponse<MagicLinkResponse>(response);
    },
    onSuccess: (data) => {
      setMagicLink(data);
      setFeedback({
        type: "success",
        message: `Magic link issued for ${data.email}. Expires in ${data.expiresIn} seconds.`,
      });
    },
    onError: (error) => {
      setMagicLink(null);
      setFeedback({ type: "error", message: error.message });
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!email.trim()) {
      setFeedback({ type: "error", message: "Email is required" });
      return;
    }

    mutation.mutate({ email: email.trim(), redirectTo: redirectTo.trim() || undefined });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="space-y-2 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Codex Star DM</p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Sign in or switch role</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Request a passwordless magic link or use a demo persona to explore the role-based navigation flows.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Magic link</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Enter an email address to generate a development magic link. The backend will deliver the email once transport is
          configured.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Redirect after login</span>
            <input
              type="text"
              value={redirectTo}
              onChange={(event) => setRedirectTo(event.target.value)}
              placeholder="/home"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Sending…" : "Send magic link"}
          </button>
        </form>
        {feedback ? (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
            }`}
          >
            <p>{feedback.message}</p>
            {magicLink ? (
              <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">
                {magicLink.magicLink}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Demo personas</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Quickly authenticate as a customer, merchant, or sales operator. This updates the auth context and triggers the
          role-based redirect target at <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">/home</code>.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{demoUser.role}</p>
                {demoUser.storeSubscriptionStatus ? (
                  <div className="mt-2">
                    <StatusBadge status={demoUser.storeSubscriptionStatus} />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Current user: <span className="font-semibold text-slate-900 dark:text-white">{user?.name ?? "Guest"}</span>
            </p>
            <p>
              Home redirect: <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">{navigation.resolveHomePath()}</code>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Link
              href="/home"
              className="flex w-full items-center justify-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white sm:w-auto"
            >
              Go to /home
            </Link>
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white sm:w-auto"
              disabled={!user}
            >
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
