import type { AuthUser } from "./auth-context";

export const DEMO_USERS: AuthUser[] = [
  {
    id: "customer-001",
    name: "Eunji Kim",
    email: "eunji.customer@example.com",
    role: "customer",
    defaultWalletId: "wallet-demo-001",
  },
  {
    id: "merchant-001",
    name: "Mina Choi",
    email: "mina.merchant@example.com",
    role: "merchant",
    storeId: "store-demo-001",
    storeSubscriptionStatus: "active",
  },
  {
    id: "sales-ops-001",
    name: "Sales Operator",
    email: "sales.ops@example.com",
    role: "sales",
  },
];
