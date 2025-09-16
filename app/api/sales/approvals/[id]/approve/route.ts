import { NextResponse } from "next/server";

import {
  CouponNotFoundError,
  updateCouponApproval,
} from "@/lib/coupon-service";
import { getSupabaseAdminClient } from "@/lib/supabase-client";

type ApproveRequestBody = {
  decidedBy?: string | null;
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

  const supabase = getSupabaseAdminClient();

  try {
    const approval = await updateCouponApproval(supabase, couponId, {
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
