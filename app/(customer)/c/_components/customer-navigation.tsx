"use client";

import { AppNavigation } from "@/app/_components/app-navigation";
import { StatusBadge } from "@/app/_components/status-badge";
import { useAuth } from "@/lib/auth-context";
import { useRoleNavigation } from "@/lib/navigation-context";

export function CustomerNavigation() {
  const navigation = useRoleNavigation("customer");
  const { user } = useAuth();

  const roleBadge =
    user?.role === "customer" ? <StatusBadge status="customer" label="Customer" /> : null;

  return (
    <AppNavigation
      title={navigation.title}
      subtitle={navigation.subtitle}
      navLinks={navigation.navLinks}
      actions={roleBadge}
    />
  );
}
