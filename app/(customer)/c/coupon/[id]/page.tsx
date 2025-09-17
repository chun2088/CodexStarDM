import type { Metadata } from "next";

import { CustomerCouponDetail } from "../../_components/customer-coupon-detail";

export const metadata: Metadata = {
  title: "Coupon Detail",
};

type CouponDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerCouponDetailPage({
  params,
}: CouponDetailPageProps) {
  const { id } = await params;

  return <CustomerCouponDetail couponId={id} />;
}
