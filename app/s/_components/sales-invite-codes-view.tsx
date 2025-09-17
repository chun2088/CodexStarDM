"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { StatusBadge } from "@/app/_components/status-badge";

type InviteCode = {
  id: string;
  code: string;
  maxUses: number | null;
  usedCount: number;
  remainingUses: number | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  note: string | null;
  createdBy:
    | {
        id: string;
        email: string | null;
        name: string | null;
      }
    | null;
};

type InviteCodeResponse = {
  inviteCodes: InviteCode[];
};

type CreateInviteInput = {
  code?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
  note?: string | null;
};

async function fetchInviteCodes() {
  const response = await fetch("/api/sales/invite-codes", { cache: "no-store" });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load invite codes");
  }

  return (await response.json()) as InviteCodeResponse;
}

async function createInviteCode(input: CreateInviteInput) {
  const response = await fetch("/api/sales/invite-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to create invite code");
  }

  return response.json();
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

export function SalesInviteCodesView() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales", "invite-codes"],
    queryFn: fetchInviteCodes,
  });

  const [formState, setFormState] = useState<CreateInviteInput>({
    code: "",
    maxUses: 5,
    expiresAt: "",
    note: "",
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | null>(null);

  const inviteCodes = data?.inviteCodes ?? [];

  const mutation = useMutation<unknown, Error, CreateInviteInput>({
    mutationFn: createInviteCode,
    onSuccess: () => {
      setFeedback("Invite code created successfully");
      setFeedbackType("success");
      setFormState({ code: "", maxUses: 5, expiresAt: "", note: "" });
      queryClient.invalidateQueries({ queryKey: ["sales", "invite-codes"] });
    },
    onError: (mutationError) => {
      setFeedback(mutationError.message);
      setFeedbackType("error");
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: CreateInviteInput = {
      code: formState.code?.trim() ? formState.code.trim() : undefined,
      note: formState.note?.trim() ? formState.note.trim() : undefined,
    };

    if (formState.maxUses !== null && formState.maxUses !== undefined) {
      payload.maxUses = formState.maxUses;
    }

    if (formState.expiresAt) {
      payload.expiresAt = formState.expiresAt;
    }

    setFeedback(null);
    setFeedbackType(null);
    mutation.mutate(payload);
  };

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Invite Codes</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Issue invite codes to onboard new merchant stores.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Custom Code</label>
            <input
              type="text"
              value={formState.code ?? ""}
              onChange={(event) => setFormState((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="Optional (leave blank for auto-generated)"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Max Uses</label>
            <input
              type="number"
              min={1}
              value={formState.maxUses ?? ""}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  maxUses: event.target.value ? Number(event.target.value) : null,
                }))
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Expires On</label>
            <input
              type="date"
              value={formState.expiresAt ?? ""}
              onChange={(event) => setFormState((prev) => ({ ...prev, expiresAt: event.target.value }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Notes</label>
            <textarea
              rows={3}
              value={formState.note ?? ""}
              onChange={(event) => setFormState((prev) => ({ ...prev, note: event.target.value }))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={mutation.isLoading}
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {mutation.isLoading ? "Issuing…" : "Issue Invite Code"}
        </button>
      </form>

      {feedback ? (
        <div
          className={`rounded-md border p-4 text-sm ${
            feedbackType === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
          }`}
        >
          {feedback}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading invite codes…</p>
      ) : error ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {(error as Error).message}
        </div>
      ) : inviteCodes.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">No invite codes issued yet.</p>
      ) : (
        <div className="space-y-4">
          {inviteCodes.map((invite) => {
            const status = invite.isActive
              ? invite.remainingUses === 0
                ? "Exhausted"
                : "Active"
              : "Inactive";

            return (
              <article
                key={invite.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{invite.code}</h3>
                    {invite.note ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300">{invite.note}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Uses: {invite.usedCount}
                        {invite.maxUses !== null ? ` / ${invite.maxUses}` : " (unlimited)"}
                      </span>
                      <span>Remaining: {invite.remainingUses ?? "∞"}</span>
                      <span>Last used: {formatDate(invite.lastUsedAt)}</span>
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </div>
                <dl className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Issued</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">{formatDate(invite.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Expires</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">{formatDate(invite.expiresAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Issued by</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">
                      {invite.createdBy?.name ?? invite.createdBy?.email ?? "System"}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
