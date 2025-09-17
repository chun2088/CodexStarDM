"use client";

import { AppNavigation } from "@/app/_components/app-navigation";
import { StatusBadge } from "@/app/_components/status-badge";
import { useAuth } from "@/lib/auth-context";
import { useRoleNavigation } from "@/lib/navigation-context";

export function MerchantNavigation() {
  const navigation = useRoleNavigation("merchant");
  const { user } = useAuth();

  const actions =
    user?.role === "merchant" ? (
      <div className="flex items-center gap-2">
        <StatusBadge status="merchant" label="Merchant" />
        {user.storeSubscriptionStatus ? <StatusBadge status={user.storeSubscriptionStatus} /> : null}
      </div>
    ) : null;

  return (
    <AppNavigation
      title={navigation.title}
      subtitle={navigation.subtitle}
      navLinks={navigation.navLinks}
      actions={actions}
    />
  );
}
