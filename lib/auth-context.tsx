"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { StoreSubscriptionStatus } from "./store-service";

export type UserRole = "customer" | "merchant" | "sales";

export type AuthUser = {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  defaultWalletId?: string | null;
  storeId?: string | null;
  storeSubscriptionStatus?: StoreSubscriptionStatus | null;
};

export type AuthContextValue = {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "codexstardm-auth";

const VALID_ROLES: ReadonlySet<UserRole> = new Set(["customer", "merchant", "sales"]);
const VALID_SUBSCRIPTION_STATUSES: ReadonlySet<StoreSubscriptionStatus> = new Set([
  "active",
  "grace",
  "canceled",
]);

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.has(value as UserRole);
}

function isStoreSubscriptionStatus(value: unknown): value is StoreSubscriptionStatus {
  return typeof value === "string" && VALID_SUBSCRIPTION_STATUSES.has(value as StoreSubscriptionStatus);
}

function normalizeUser(user: AuthUser): AuthUser {
  const normalized: AuthUser = {
    id: user.id,
    name: user.name,
    role: user.role,
  };

  const email = asNonEmptyString(user.email);
  if (email) {
    normalized.email = email;
  }

  const defaultWalletId = asNonEmptyString(user.defaultWalletId);
  if (defaultWalletId) {
    normalized.defaultWalletId = defaultWalletId;
  }

  const storeId = asNonEmptyString(user.storeId);
  if (storeId) {
    normalized.storeId = storeId;
  }

  if (user.storeSubscriptionStatus && isStoreSubscriptionStatus(user.storeSubscriptionStatus)) {
    normalized.storeSubscriptionStatus = user.storeSubscriptionStatus;
  }

  return normalized;
}

function parseStoredUser(rawValue: unknown): AuthUser | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const record = rawValue as Record<string, unknown>;
  const id = asNonEmptyString(record.id);
  const name = asNonEmptyString(record.name);
  const role = record.role;

  if (!id || !name || !isUserRole(role)) {
    return null;
  }

  const user: AuthUser = {
    id,
    name,
    role,
  };

  const email = asNonEmptyString(record.email);
  if (email) {
    user.email = email;
  }

  const defaultWalletId = asNonEmptyString(record.defaultWalletId ?? record.walletId);
  if (defaultWalletId) {
    user.defaultWalletId = defaultWalletId;
  }

  const storeId = asNonEmptyString(record.storeId);
  if (storeId) {
    user.storeId = storeId;
  }

  const subscriptionStatus = record.storeSubscriptionStatus;
  if (isStoreSubscriptionStatus(subscriptionStatus)) {
    user.storeSubscriptionStatus = subscriptionStatus;
  }

  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY);
      if (storedValue) {
        const parsed = parseStoredUser(JSON.parse(storedValue));
        if (parsed) {
          setUser(parsed);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn("Unable to restore auth session", error);
    }
  }, []);

  const login = useCallback((nextUser: AuthUser) => {
    const normalized = normalizeUser(nextUser);
    setUser(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
    }),
    [login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
