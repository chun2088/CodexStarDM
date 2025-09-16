import { NextResponse } from "next/server";

import {
  CouponNotFoundError,
  updateCouponApproval,
} from "@/lib/coupon-service";
import { getSupabaseAdminClient } from "@/lib/supabase-client";

type RejectRequestBody = {
  decidedBy?: string | null;
  reason?: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const couponId = params.id;

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

  const supabase = getSupabaseAdminClient();

  try {
    const approval = await updateCouponApproval(supabase, couponId, {
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
