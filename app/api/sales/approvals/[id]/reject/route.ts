import { NextResponse } from "next/server";

import {
  CouponNotFoundError,
  updateCouponApproval,
} from "@/lib/coupon-service";
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireAuthenticatedUser,
} from "@/lib/server-auth";

type RequireAuthenticatedUser = typeof requireAuthenticatedUser;

type RejectDependencies = {
  requireAuthenticatedUser: RequireAuthenticatedUser;
  updateCouponApproval: typeof updateCouponApproval;
};

const rejectDependencies: RejectDependencies = {
  requireAuthenticatedUser,
  updateCouponApproval,
};

type RejectRequestBody = {
  decidedBy?: string | null;
  reason?: string | null;
};

type RouteContext = { params: Promise<{ id: string }> };

export async function handleReject(
  request: Request,
  { params }: RouteContext,
  deps: RejectDependencies = rejectDependencies,
) {
  const { id: couponId } = await params;

  if (!couponId) {
    return NextResponse.json(
      { error: "Coupon id is required" },
      { status: 400 },
    );
  }

  let body: RejectRequestBody;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse rejection payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!reason) {
    return NextResponse.json(
      { error: "Rejection reason is required" },
      { status: 400 },
    );
  }

  const decidedBy = body.decidedBy ?? null;

  let auth: Awaited<ReturnType<RequireAuthenticatedUser>>;

  try {
    auth = await deps.requireAuthenticatedUser({ requiredRole: "sales" });
  } catch (error) {
    if (isAuthorizationError(error)) {
      return authorizationErrorResponse(error);
    }

    throw error;
  }

  const { supabase } = auth;

  try {
    const approval = await deps.updateCouponApproval(supabase, couponId, {
      status: "rejected",
      decidedBy,
      reason,
    });

    return NextResponse.json({ approval });
  } catch (error) {
    if (error instanceof CouponNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 },
      );
    }

    console.error("Failed to reject coupon", error);
    return NextResponse.json(
      { error: "Unable to reject coupon" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  return handleReject(request, context);
}
