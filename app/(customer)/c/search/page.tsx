import type { Metadata } from "next";

import { CustomerSearchView } from "../_components/customer-search-view";

export const metadata: Metadata = {
  title: "Customer Search",
};

export default function CustomerSearchPage() {
  return <CustomerSearchView />;
}
