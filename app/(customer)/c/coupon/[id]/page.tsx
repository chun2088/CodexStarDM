import type { Metadata } from "next";

import { CustomerCouponDetail } from "../../_components/customer-coupon-detail";

export const metadata: Metadata = {
  title: "Coupon Detail",
};

type CouponDetailPageProps = {
  params: { id: string };
};

export default function CustomerCouponDetailPage({ params }: CouponDetailPageProps) {
  return <CustomerCouponDetail couponId={params.id} />;
}
