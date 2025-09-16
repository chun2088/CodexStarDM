import type { Metadata } from "next";

import { SalesStoresView } from "../_components/sales-stores-view";

export const metadata: Metadata = {
  title: "Stores",
};

export default function SalesStoresPage() {
  return (
    <div className="space-y-10">
      <SalesStoresView />
    </div>
  );
}
