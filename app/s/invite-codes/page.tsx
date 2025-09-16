import type { Metadata } from "next";

import { SalesInviteCodesView } from "../_components/sales-invite-codes-view";

export const metadata: Metadata = {
  title: "Invite Codes",
};

export default function SalesInviteCodesPage() {
  return (
    <div className="space-y-10">
      <SalesInviteCodesView />
    </div>
  );
}
