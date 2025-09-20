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
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:w-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{subtitle}</p>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
        </div>
        <nav className="-mx-4 flex w-[calc(100%+2rem)] flex-nowrap items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:w-auto md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={buildLinkClasses(isActive)}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        {actions ? (
          <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
