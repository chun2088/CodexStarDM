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

type ApproveDependencies = {
  requireAuthenticatedUser: RequireAuthenticatedUser;
  updateCouponApproval: typeof updateCouponApproval;
};

const approveDependencies: ApproveDependencies = {
  requireAuthenticatedUser,
  updateCouponApproval,
};

type ApproveRequestBody = {
  decidedBy?: string | null;
};

type RouteContext = { params: Promise<{ id: string }> };

export async function handleApprove(
  request: Request,
  { params }: RouteContext,
  deps: ApproveDependencies = approveDependencies,
) {
  const { id: couponId } = await params;

  if (!couponId) {
    return NextResponse.json(
      { error: "Coupon id is required" },
      { status: 400 },
    );
  }

  let body: ApproveRequestBody | null = null;

  if (request.headers.get("content-length")) {
    try {
      body = await request.json();
    } catch (error) {
      console.error("Failed to parse approval payload", error);
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
  }

  const decidedBy = body?.decidedBy ?? null;

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
      status: "approved",
      decidedBy,
    });

    return NextResponse.json({ approval });
  } catch (error) {
    if (error instanceof CouponNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 },
      );
    }

    console.error("Failed to approve coupon", error);
    return NextResponse.json(
      { error: "Unable to approve coupon" },
      { status: 500 },
    );
  }
}

export type { ApproveDependencies, RouteContext };
