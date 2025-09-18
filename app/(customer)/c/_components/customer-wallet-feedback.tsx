"use client";

import { StatusBadge } from "@/app/_components/status-badge";

export type Feedback = {
  type: "success" | "error";
  message: string;
  subscriptionStatus?: string | null;
};

export function FeedbackAlert({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }

  const className =
    feedback.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${className}`}>
      <p>{feedback.message}</p>
      {feedback.subscriptionStatus ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Subscription status
          <StatusBadge status={feedback.subscriptionStatus} />
        </p>
      ) : null}
    </div>
  );
}
