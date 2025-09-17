import type { Metadata } from "next";

import { MerchantSubscriptionView } from "../_components/merchant-subscription-view";

export const metadata: Metadata = {
  title: "Merchant Subscription",
};

export default function MerchantSubscriptionPage() {
  return <MerchantSubscriptionView />;
}
