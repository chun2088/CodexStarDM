import { parseJsonResponse } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";

export type CustomerCoupon = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  discountType: string;
  discountValue: number;
  startAt: string | null;
  endAt: string | null;
  metadata: Record<string, unknown> | null;
  redeemedCount: number;
  maxRedemptions: number | null;
  storeId: string | null;
};

type CouponsResponse = {
  coupons: CustomerCoupon[];
};

async function fetchCoupons() {
  const response = await fetch("/api/coupons", { cache: "no-store" });
  return parseJsonResponse<CouponsResponse>(response);
}

export function useAvailableCoupons() {
  return useQuery<CustomerCoupon[]>({
    queryKey: ["customer", "coupons"],
    queryFn: async () => {
      const payload = await fetchCoupons();
      return payload?.coupons ?? [];
    },
  });
}
