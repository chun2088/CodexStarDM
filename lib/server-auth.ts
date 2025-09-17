import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseRouteHandlerClient } from "./supabase-client";

export type AppUserRole = "admin" | "merchant" | "customer" | "sales";

const VALID_ROLES: ReadonlySet<AppUserRole> = new Set([
  "admin",
  "merchant",
  "customer",
  "sales",
]);

export class AuthorizationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export class AuthenticationError extends AuthorizationError {
  constructor(message = "Authentication required") {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends AuthorizationError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class ProfileNotFoundError extends AuthorizationError {
  constructor(message = "User profile not found") {
    super(message, 404);
    this.name = "ProfileNotFoundError";
  }
}

export class ProfileLookupError extends AuthorizationError {
  constructor(message = "Unable to verify user profile") {
    super(message, 500);
    this.name = "ProfileLookupError";
  }
}

export type AuthenticatedUser = {
  id: string;
  role: AppUserRole;
  email: string | null;
  name: string | null;
};

export type AuthContext = {
  supabase: SupabaseClient;
  user: AuthenticatedUser;
};

type RequireUserOptions = {
  requiredRole?: AppUserRole | AppUserRole[];
  supabase?: SupabaseClient;
};

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function assertRoleAllowed(role: AppUserRole, allowed?: AppUserRole | AppUserRole[]) {
  if (!allowed) {
    return;
  }

  const allowedRoles = toArray(allowed);
  if (!allowedRoles.includes(role)) {
    throw new ForbiddenError();
  }
}

export async function requireAuthenticatedUser({
  requiredRole,
  supabase: providedSupabase,
}: RequireUserOptions = {}): Promise<AuthContext> {
  const supabase = providedSupabase ?? createSupabaseRouteHandlerClient();

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new ProfileLookupError("Unable to verify session");
  }

  const session = data?.session;

  if (!session?.user) {
    throw new AuthenticationError();
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role, email, full_name")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError) {
    throw new ProfileLookupError();
  }

  if (!profile) {
    throw new ProfileNotFoundError();
  }

  const role = String(profile.role ?? "").trim() as AppUserRole;

  if (!VALID_ROLES.has(role)) {
    throw new ForbiddenError();
  }

  assertRoleAllowed(role, requiredRole);

  return {
    supabase,
    user: {
      id: profile.id,
      role,
      email: profile.email ?? null,
      name: profile.full_name ?? null,
    },
  } satisfies AuthContext;
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

export function authorizationErrorResponse(error: AuthorizationError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}
