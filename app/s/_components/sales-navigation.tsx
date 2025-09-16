"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/s/stores", label: "Stores" },
  { href: "/s/approvals", label: "Approvals" },
  { href: "/s/invite-codes", label: "Invite Codes" },
];

function linkClasses(isActive: boolean) {
  const base =
    "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors";
  if (isActive) {
    return `${base} bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900`;
  }

  return `${base} text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white`;
}

export function SalesNavigation() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Sales Console
          </p>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Operations Workspace</h1>
        </div>
        <nav className="flex gap-2">
          {NAV_LINKS.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={linkClasses(isActive)}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
