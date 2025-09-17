import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthenticationError,
  ForbiddenError,
  ProfileNotFoundError,
  requireAuthenticatedUser,
  type AuthContext,
} from "./server-auth";
import { handleApprove } from "@/app/api/sales/approvals/[id]/approve/route";
import { handleReject } from "@/app/api/sales/approvals/[id]/reject/route";

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

test("approve handler returns 401 when authentication fails", async () => {
  const response = await handleApprove(
    new Request("http://localhost/api/sales/approvals/123/approve", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "coupon-123" }) },
    {
      async requireAuthenticatedUser() {
        throw new AuthenticationError();
      },
      async updateCouponApproval() {
        assert.fail("updateCouponApproval should not run for unauthorized requests");
      },
    },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("approve handler uses the authenticated Supabase client", async () => {
  const supabase = Symbol("supabase") as unknown as AuthContext["supabase"];
  let receivedClient: unknown = null;

  const response = await handleApprove(
    new Request("http://localhost/api/sales/approvals/123/approve", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "coupon-approve" }) },
    {
      async requireAuthenticatedUser() {
        return {
          supabase,
          user: {
            id: "user-1",
            role: "sales",
            email: "sales@example.com",
            name: "Sales User",
          },
        } satisfies AuthContext;
      },
      async updateCouponApproval(client, couponId, payload) {
        receivedClient = client;
        assert.equal(couponId, "coupon-approve");
        assert.deepEqual(payload, { status: "approved", decidedBy: null });

        return {
          status: "approved",
          decidedAt: "2024-01-01T00:00:00.000Z",
          decidedBy: null,
          reason: null,
          history: [],
        };
      },
    },
  );

  assert.equal(receivedClient, supabase);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    approval: {
      status: "approved",
      decidedAt: "2024-01-01T00:00:00.000Z",
      decidedBy: null,
      reason: null,
      history: [],
    },
  });
});

test("reject handler returns 401 when authentication fails", async () => {
  const response = await handleReject(
    new Request("http://localhost/api/sales/approvals/123/reject", {
      method: "POST",
      body: JSON.stringify({ reason: "Out of policy" }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "coupon-456" }) },
    {
      async requireAuthenticatedUser() {
        throw new AuthenticationError();
      },
      async updateCouponApproval() {
        assert.fail("updateCouponApproval should not run for unauthorized requests");
      },
    },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("reject handler uses the authenticated Supabase client", async () => {
  const supabase = Symbol("supabase") as unknown as AuthContext["supabase"];
  let receivedClient: unknown = null;
  let receivedPayload: unknown = null;

  const response = await handleReject(
    new Request("http://localhost/api/sales/approvals/123/reject", {
      method: "POST",
      body: JSON.stringify({
        reason: "  Duplicate submission  ",
        decidedBy: "sales-42",
      }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "coupon-reject" }) },
    {
      async requireAuthenticatedUser() {
        return {
          supabase,
          user: {
            id: "user-2",
            role: "sales",
            email: "sales@example.com",
            name: "Sales User",
          },
        } satisfies AuthContext;
      },
      async updateCouponApproval(client, couponId, payload) {
        receivedClient = client;
        receivedPayload = payload;
        assert.equal(couponId, "coupon-reject");

        return {
          status: "rejected",
          decidedAt: "2024-01-01T00:00:00.000Z",
          decidedBy: "sales-42",
          reason: "duplicate",
          history: [],
        };
      },
    },
  );

  assert.equal(receivedClient, supabase);
  assert.deepEqual(receivedPayload, {
    status: "rejected",
    decidedBy: "sales-42",
    reason: "Duplicate submission",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    approval: {
      status: "rejected",
      decidedAt: "2024-01-01T00:00:00.000Z",
      decidedBy: "sales-42",
      reason: "duplicate",
      history: [],
    },
  });
});
