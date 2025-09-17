import type { ReactNode } from "react";

import { CustomerNavigation } from "./_components/customer-navigation";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <CustomerNavigation />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">{children}</main>
    </div>
  );
}
