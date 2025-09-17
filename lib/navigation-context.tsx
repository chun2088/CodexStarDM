"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useAuth, type AuthUser, type UserRole } from "./auth-context";

export type NavigationLink = {
  href: string;
  label: string;
};

export type RoleNavigationDefinition = {
  role: UserRole;
  title: string;
  subtitle: string;
  homePath: string;
  navLinks: NavigationLink[];
};

const ROLE_NAVIGATION: Record<UserRole, RoleNavigationDefinition> = {
  customer: {
    role: "customer",
    title: "Customer Wallet",
    subtitle: "Customer App",
    homePath: "/c/home",
    navLinks: [
      { href: "/c/home", label: "Home" },
      { href: "/c/search", label: "Search" },
      { href: "/c/wallet", label: "Wallet" },
    ],
  },
  merchant: {
    role: "merchant",
    title: "Merchant Console",
    subtitle: "Merchant Portal",
    homePath: "/m/home",
    navLinks: [
      { href: "/m/home", label: "Home" },
      { href: "/m/coupons", label: "Coupons" },
      { href: "/m/scan", label: "Scan" },
      { href: "/m/subscription", label: "Subscription" },
    ],
  },
  sales: {
    role: "sales",
    title: "Operations Workspace",
    subtitle: "Sales Console",
    homePath: "/s/stores",
    navLinks: [
      { href: "/s/stores", label: "Stores" },
      { href: "/s/approvals", label: "Approvals" },
      { href: "/s/invite-codes", label: "Invite Codes" },
    ],
  },
};

const DEFAULT_HOME_PATH = "/";
const DEFAULT_ROLE: UserRole = "customer";

function resolveActiveRole(user: AuthUser | null): UserRole | null {
  return user?.role ?? null;
}

type NavigationContextValue = {
  activeRole: UserRole | null;
  definition: RoleNavigationDefinition | null;
  resolveHomePath: (role?: UserRole | null) => string;
  getDefinitionForRole: (role: UserRole) => RoleNavigationDefinition;
};

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const value = useMemo<NavigationContextValue>(() => {
    const activeRole = resolveActiveRole(user);
    const definition = activeRole ? ROLE_NAVIGATION[activeRole] : null;

    const resolveHomePath = (role?: UserRole | null) => {
      if (role && ROLE_NAVIGATION[role]) {
        return ROLE_NAVIGATION[role].homePath;
      }

      if (definition) {
        return definition.homePath;
      }

      return DEFAULT_HOME_PATH;
    };

    const getDefinitionForRole = (role: UserRole) => ROLE_NAVIGATION[role];

    return {
      activeRole,
      definition,
      resolveHomePath,
      getDefinitionForRole,
    };
  }, [user]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }

  return context;
}

export function useRoleNavigation(role?: UserRole | null) {
  const { definition, getDefinitionForRole } = useNavigation();

  if (role) {
    return getDefinitionForRole(role);
  }

  if (definition) {
    return definition;
  }

  return getDefinitionForRole(DEFAULT_ROLE);
}
