import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { isRecord, normalizeIsoTimestamp } from "@/lib/utils/data";

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

function parseLimit(raw: string | null, fallback = 100) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const clamped = Math.max(1, Math.min(500, Math.floor(parsed)));
  return clamped;
}

function parseSince(raw: string | null) {
  if (!raw) {
    return null;
  }

  return normalizeIsoTimestamp(raw) ?? null;
}

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

function toCsv(events: NormalizedEvent[]) {
  const header = [
    "id",
    "type",
    "created_at",
    "occurred_at",
    "message",
    "source",
    "context",
    "details",
  ];

  const escapeCell = (value: unknown) => {
    const stringValue = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  const rows = events.map((event) => [
    event.id,
    event.type,
    event.createdAt,
    event.occurredAt,
    event.message ?? "",
    event.source ?? "",
    JSON.stringify(event.context ?? {}),
    JSON.stringify(event.details ?? {}),
  ]);

  return [header, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\n");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const format = searchParams.get("format");
  const since = parseSince(searchParams.get("since"));

  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from("events")
    .select("id, type, data, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to load events for admin export", error);
    return NextResponse.json(
      { error: "Unable to load event data" },
      { status: 500 },
    );
  }

  const events = (data as EventRow[] | null | undefined)?.map(normalizeEvent) ?? [];

  if (format === "csv") {
    const csv = toCsv(events);
    const response = new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="events-export-${Date.now()}.csv"`,
        "Cache-Control": "no-store",
      },
    });

    return response;
  }

  return NextResponse.json({
    events,
    meta: {
      count: events.length,
      limit,
      since,
    },
  });
}
