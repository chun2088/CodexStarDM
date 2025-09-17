import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthenticationError,
  ForbiddenError,
  ProfileNotFoundError,
  requireAuthenticatedUser,
  type AuthContext,
} from "./server-auth";

function createSupabaseStub({
  session,
  profile,
  sessionError = null,
  profileError = null,
}: {
  session: { user: { id: string } } | null;
  profile: { id: string; role: string; email?: string | null; full_name?: string | null } | null;
  sessionError?: Error | null;
  profileError?: Error | null;
}) {
  return {
    auth: {
      async getSession() {
        return {
          data: { session },
          error: sessionError,
        };
      },
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: profile,
                    error: profileError,
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown;
}

test("requireAuthenticatedUser throws when session is missing", async () => {
  const supabase = createSupabaseStub({ session: null, profile: null });

  await assert.rejects(
    () => requireAuthenticatedUser({ supabase: supabase as AuthContext["supabase"] }),
    AuthenticationError,
  );
});

test("requireAuthenticatedUser throws when profile is missing", async () => {
  const supabase = createSupabaseStub({
    session: { user: { id: "user-123" } },
    profile: null,
  });

  await assert.rejects(
    () => requireAuthenticatedUser({ supabase: supabase as AuthContext["supabase"] }),
    ProfileNotFoundError,
  );
});

test("requireAuthenticatedUser enforces required roles", async () => {
  const supabase = createSupabaseStub({
    session: { user: { id: "user-123" } },
    profile: { id: "user-123", role: "customer" },
  });

  await assert.rejects(
    () =>
      requireAuthenticatedUser({
        supabase: supabase as AuthContext["supabase"],
        requiredRole: "merchant",
      }),
    ForbiddenError,
  );
});
