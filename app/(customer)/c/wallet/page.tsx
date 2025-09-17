import type { Metadata } from "next";

import { CustomerWalletView } from "../_components/customer-wallet-view";

export const metadata: Metadata = {
  title: "Customer Wallet",
};

export default function CustomerWalletPage() {
  return <CustomerWalletView />;
}
