import Link from "next/link";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { formatDateTime, isRecord } from "@/lib/utils/data";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 50;

type EventRow = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

type NormalizedEvent = {
  id: string;
  type: string;
  createdAt: string;
  occurredAt: string;
  message: string | null;
  source: string | null;
  context: Record<string, unknown>;
  details: Record<string, unknown>;
};

function normalizeEvent(row: EventRow): NormalizedEvent {
  const payload = isRecord(row.data) ? row.data : {};
  const context = isRecord(payload.context) ? (payload.context as Record<string, unknown>) : {};
  const details = isRecord(payload.details) ? (payload.details as Record<string, unknown>) : {};
  const occurredAt = typeof payload.occurredAt === "string" && payload.occurredAt
    ? payload.occurredAt
    : row.created_at;
  const message = typeof payload.message === "string" ? payload.message : null;
  const source = typeof payload.source === "string" ? payload.source : null;

  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    occurredAt,
    message,
    source,
    context,
    details,
  };
}

function formatJson(value: Record<string, unknown>) {
  const keys = Object.keys(value);

  if (keys.length === 0) {
    return "{}";
  }

  return JSON.stringify(value, null, 2);
}

export default async function AdminEventsPage() {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("events")
    .select("id, type, data, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_EVENTS);

  if (error) {
    console.error("Failed to load events for admin view", error);
  }

  const events = (data as EventRow[] | null | undefined)?.map(normalizeEvent) ?? [];
  const hasError = Boolean(error);

  return (
    <main className="min-h-screen bg-slate-100 py-10 dark:bg-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4">
        <header className="rounded-3xl border border-black/10 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">Admin</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">Event activity</h1>
          <p className="mt-4 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            Review the latest platform events captured from API workflows. Export the dataset for deeper analysis or import into your observability pipeline.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/api/admin/events?format=csv&limit=${MAX_EVENTS * 10}`}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Download CSV export
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-black/10 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent events</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Showing the latest {events.length} records (max {MAX_EVENTS}).
              </p>
            </div>
            {hasError ? (
              <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                Unable to refresh events. Showing last known data.
              </p>
            ) : null}
          </div>

          {events.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              No events have been recorded yet. Trigger wallet or billing actions to generate analytics data.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full table-fixed text-left text-sm text-slate-700 dark:text-slate-200">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="w-48 px-4 py-3">Type</th>
                    <th className="w-44 px-4 py-3">Occurred</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="w-32 px-4 py-3">Source</th>
                    <th className="w-64 px-4 py-3">Context</th>
                    <th className="w-64 px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {events.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="px-4 py-4 font-medium text-slate-900 dark:text-white">
                        <div>{event.type}</div>
                        <div className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">{event.id}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700 dark:text-slate-200">
                        <div>{formatDateTime(event.occurredAt)}</div>
                        {event.createdAt !== event.occurredAt ? (
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Recorded {formatDateTime(event.createdAt)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700 dark:text-slate-200">
                        {event.message ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {event.source ?? "api"}
                      </td>
                      <td className="px-4 py-4">
                        <pre className="whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">
                          {formatJson(event.context)}
                        </pre>
                      </td>
                      <td className="px-4 py-4">
                        <pre className="whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">
                          {formatJson(event.details)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
