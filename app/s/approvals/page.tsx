import type { Metadata } from "next";

import { SalesApprovalsView } from "../_components/sales-approvals-view";

export const metadata: Metadata = {
  title: "Approvals",
};

export default function SalesApprovalsPage() {
  return (
    <div className="space-y-10">
      <SalesApprovalsView />
    </div>
  );
}
