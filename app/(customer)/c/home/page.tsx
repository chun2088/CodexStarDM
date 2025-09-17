import type { Metadata } from "next";

import { CustomerHomeView } from "../_components/customer-home-view";

export const metadata: Metadata = {
  title: "Customer Home",
};

export default function CustomerHomePage() {
  return <CustomerHomeView />;
}
