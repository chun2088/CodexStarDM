import type { Metadata } from "next";

import { MerchantHomeView } from "../_components/merchant-home-view";

export const metadata: Metadata = {
  title: "Merchant Home",
};

export default function MerchantHomePage() {
  return <MerchantHomeView />;
}
