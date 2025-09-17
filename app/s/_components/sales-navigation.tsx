"use client";

import { AppNavigation } from "@/app/_components/app-navigation";
import { useRoleNavigation } from "@/lib/navigation-context";

export function SalesNavigation() {
  const navigation = useRoleNavigation("sales");

  return (
    <AppNavigation
      title={navigation.title}
      subtitle={navigation.subtitle}
      navLinks={navigation.navLinks}
    />
  );
}
