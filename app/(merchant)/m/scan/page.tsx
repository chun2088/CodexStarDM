import type { Metadata } from "next";

import { MerchantScanView } from "../_components/merchant-scan-view";

export const metadata: Metadata = {
  title: "Merchant Scan",
};

export default function MerchantScanPage() {
  return <MerchantScanView />;
}
