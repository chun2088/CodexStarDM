"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { StatusBadge } from "@/app/_components/status-badge";
import { useAuth } from "@/lib/auth-context";
import { useNavigation } from "@/lib/navigation-context";

export function HomeRedirect() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const router = useRouter();

  const targetPath = useMemo(() => {
    if (user?.role) {
      return navigation.resolveHomePath(user.role);
    }

    return "/login";
  }, [navigation, user?.role]);

  useEffect(() => {
    router.replace(targetPath);
  }, [router, targetPath]);

  return (
    <div className="mx-auto max-w-md space-y-4 text-center">
      <StatusBadge status={user?.role ?? "guest"} label={user ? `Redirecting to ${targetPath}` : "Guest"} />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {user
          ? `Detected ${user.role} role. Redirecting you to ${targetPath}.`
          : "No authenticated user detected. Redirecting to the login screen."}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Having trouble?{" "}
        <Link href={targetPath} className="font-semibold underline">
          Continue manually
        </Link>{" "}
        or return to the{" "}
        <Link href="/" className="font-semibold underline">
          landing page
        </Link>
        .
      </p>
    </div>
  );
}
