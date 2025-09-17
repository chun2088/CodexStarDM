import type { Metadata } from "next";

import { MerchantCouponsView } from "../_components/merchant-coupons-view";

export const metadata: Metadata = {
  title: "Merchant Coupons",
};

export default function MerchantCouponsPage() {
  return <MerchantCouponsView />;
}
