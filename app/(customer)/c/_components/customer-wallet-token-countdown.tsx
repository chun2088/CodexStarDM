"use client";

import { useEffect, useState } from "react";

export function TokenCountdown({ expiresAt }: { expiresAt?: string | null }) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => {
    if (!expiresAt) {
      return null;
    }

    const target = new Date(expiresAt);
    if (Number.isNaN(target.getTime())) {
      return null;
    }

    const diff = Math.ceil((target.getTime() - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  });

  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const target = new Date(expiresAt);
    if (Number.isNaN(target.getTime())) {
      setRemainingSeconds(null);
      return;
    }

    const targetMs = target.getTime();

    const update = () => {
      const diff = Math.ceil((targetMs - Date.now()) / 1000);
      setRemainingSeconds(diff > 0 ? diff : 0);
    };

    update();

    const interval = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [expiresAt]);

  if (!expiresAt || remainingSeconds === null) {
    return <span className="text-slate-500 dark:text-slate-400">—</span>;
  }

  if (remainingSeconds <= 0) {
    return <span className="font-semibold text-rose-600 dark:text-rose-300">Expired</span>;
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <span className="font-semibold text-slate-900 dark:text-white">
      {minutes}:{seconds.toString().padStart(2, "0")} remaining
    </span>
  );
}
