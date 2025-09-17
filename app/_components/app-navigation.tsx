"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type AppNavLink = {
  href: string;
  label: string;
};

function buildLinkClasses(isActive: boolean) {
  const base = "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors";

  if (isActive) {
    return `${base} bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900`;
  }

  return `${base} text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white`;
}

export function AppNavigation({
  title,
  subtitle,
  navLinks,
  actions,
}: {
  title: string;
  subtitle: string;
  navLinks: AppNavLink[];
  actions?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{subtitle}</p>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={buildLinkClasses(isActive)}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
