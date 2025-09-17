"use client";

import Link from "next/link";

import { StatusBadge } from "@/app/_components/status-badge";
import { useAuth } from "@/lib/auth-context";
import { useRoleNavigation } from "@/lib/navigation-context";

function describeStatus(status: string | null | undefined) {
  switch (status) {
    case "active":
      return "Subscription is active. All merchant features are available.";
    case "grace":
      return "Payment retry is in progress. Core features remain available during the grace period.";
    case "canceled":
      return "Subscription is canceled. Renew billing to restore coupon and scan access.";
    default:
      return "No subscription on file. Connect billing to unlock coupon authoring and scanning.";
  }
}

export function MerchantHomeView() {
  const { user } = useAuth();
  const navigation = useRoleNavigation("merchant");

  const subscriptionStatus = user?.storeSubscriptionStatus ?? null;
  const storeId = user?.storeId ?? "-";
  const statusDescription = describeStatus(subscriptionStatus);

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Merchant overview</p>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">{user?.name ?? "Merchant"}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Store ID: {storeId}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Subscription</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={subscriptionStatus ?? "inactive"} />
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{statusDescription}</p>
          <Link
            href="/m/subscription"
            className="mt-4 inline-flex items-center text-xs font-semibold text-slate-900 underline underline-offset-2 dark:text-white"
          >
            Manage subscription →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Coupons</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Draft, activate, and pause coupons to control customer availability in real time.
          </p>
          <Link
            href="/m/coupons"
            className="mt-4 inline-flex items-center text-xs font-semibold text-slate-900 underline underline-offset-2 dark:text-white"
          >
            Go to coupons →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Scan mode</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Use QR scanning to verify wallet ownership and complete redemption securely.
          </p>
          <Link
            href="/m/scan"
            className="mt-4 inline-flex items-center text-xs font-semibold text-slate-900 underline underline-offset-2 dark:text-white"
          >
            Open scan station →
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Quick navigation</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Jump between merchant workflows. These links mirror the navigation items in the header.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {navigation.navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
