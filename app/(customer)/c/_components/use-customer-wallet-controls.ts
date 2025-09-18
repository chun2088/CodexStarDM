"use client";

import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import type { AuthUser } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { ActiveQrToken, WalletCouponEntry } from "./use-wallet";
import type { Feedback } from "./customer-wallet-feedback";
import { formatDateTime, requireWalletAuthentication } from "./customer-wallet-utils";

export type ClaimResponse = {
  message: string;
  coupon: {
    id: string;
    code: string;
    name: string | null;
    description: string | null;
  };
  wallet: {
    id: string;
    status: string;
  };
};

export type GenerateQrResponse = {
  token: string;
  expiresAt: string;
  wallet: {
    id: string;
    status: string;
  };
};

export type RedeemResponse = {
  redeemedAt: string;
  coupon: {
    id: string;
    code: string;
  } | null;
  redemptionId: string | null;
  wallet: {
    id: string;
    status: string;
  };
};

type RefetchWallet = () => void;

type CouponClaimedHandler = (couponId: string) => void;

type RedeemSuccessHandler = () => void;

export function useWalletIdForm(defaultWalletId?: string | null) {
  const [walletIdInput, setWalletIdInput] = useState(defaultWalletId ?? "");
  const [walletId, setWalletId] = useState(defaultWalletId ?? "");

  useEffect(() => {
    if (!walletId && defaultWalletId) {
      setWalletIdInput(defaultWalletId);
      setWalletId(defaultWalletId);
    }
  }, [defaultWalletId, walletId]);

  const handleWalletIdSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWalletId(walletIdInput.trim());
  };

  return { walletId, walletIdInput, setWalletIdInput, handleWalletIdSubmit };
}

export function useCouponSelection(entries: WalletCouponEntry[]) {
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedCouponId(null);
      return;
    }

    setSelectedCouponId((current) => {
      if (current && entries.some((entry) => entry.couponId === current)) {
        return current;
      }

      return entries[0]?.couponId ?? null;
    });
  }, [entries]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.couponId === selectedCouponId) ?? null,
    [entries, selectedCouponId],
  );

  return { selectedCouponId, setSelectedCouponId, selectedEntry };
}

type ClaimCouponOptions = {
  user: AuthUser | null;
  walletId: string;
  onCouponClaimed: CouponClaimedHandler;
  refetchWallet: RefetchWallet;
};

export function useClaimCoupon({ user, walletId, onCouponClaimed, refetchWallet }: ClaimCouponOptions) {
  const [claimCouponId, setClaimCouponId] = useState("");
  const [claimFeedback, setClaimFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    setClaimCouponId("");
    setClaimFeedback(null);
  }, [walletId]);

  const claimMutation = useMutation<ClaimResponse, ApiError, { walletId: string; couponId: string }>({
    mutationFn: async ({ walletId: wallet, couponId: coupon }) => {
      const response = await fetch(`/api/coupons/${coupon}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: wallet }),
      });

      return parseJsonResponse<ClaimResponse>(response);
    },
    onSuccess: (data) => {
      setClaimFeedback({ type: "success", message: data.message });
      setClaimCouponId("");
      onCouponClaimed(data.coupon.id);
      refetchWallet();
    },
    onError: (error) => {
      const subscriptionStatus = extractSubscriptionStatus(error.payload);
      setClaimFeedback({
        type: "error",
        message: error.message,
        subscriptionStatus,
      });
    },
  });

  const submitClaim = (couponId: string) => {
    const trimmedWalletId = walletId.trim();
    if (!trimmedWalletId) {
      setClaimFeedback({
        type: "error",
        message: "Claiming a coupon requires a wallet. Enter a wallet ID and load the wallet first.",
      });
      return;
    }

    claimMutation.mutate({ walletId: trimmedWalletId, couponId });
  };

  const handleManualClaimSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClaimFeedback(null);

    const authError = requireWalletAuthentication(user, walletId, "Claiming a coupon");
    if (authError) {
      setClaimFeedback({ type: "error", message: authError });
      return;
    }

    const coupon = claimCouponId.trim();
    if (!coupon) {
      setClaimFeedback({ type: "error", message: "couponId is required" });
      return;
    }

    submitClaim(coupon);
  };

  const claimSelectedCoupon = (couponId: string | null) => {
    setClaimFeedback(null);

    const authError = requireWalletAuthentication(user, walletId, "Claiming a coupon");
    if (authError) {
      setClaimFeedback({ type: "error", message: authError });
      return;
    }

    if (!couponId) {
      setClaimFeedback({ type: "error", message: "Select a coupon before claiming." });
      return;
    }

    submitClaim(couponId);
  };

  return {
    claimCouponId,
    setClaimCouponId,
    claimFeedback,
    claimMutation,
    handleManualClaimSubmit,
    claimSelectedCoupon,
  };
}

type QrTokenOptions = {
  user: AuthUser | null;
  walletId: string;
  refetchWallet: RefetchWallet;
};

export function useQrToken({ user, walletId, refetchWallet }: QrTokenOptions) {
  const [qrFeedback, setQrFeedback] = useState<Feedback | null>(null);
  const [qrResult, setQrResult] = useState<GenerateQrResponse | null>(null);

  useEffect(() => {
    setQrFeedback(null);
    setQrResult(null);
  }, [walletId]);

  const qrMutation = useMutation<GenerateQrResponse, ApiError, { walletId: string; couponId?: string }>({
    mutationFn: async ({ walletId: wallet, couponId }) => {
      const response = await fetch(`/api/wallet/${wallet}/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId: couponId ?? null }),
      });

      return parseJsonResponse<GenerateQrResponse>(response);
    },
    onSuccess: (data) => {
      setQrResult(data);
      setQrFeedback({
        type: "success",
        message: "QR token created. Present it to the merchant before the timer expires.",
      });
      refetchWallet();
    },
    onError: (error) => {
      const subscriptionStatus = extractSubscriptionStatus(error.payload);
      setQrFeedback({ type: "error", message: error.message, subscriptionStatus });
    },
  });

  const generateQrForCoupon = (couponId: string | null) => {
    setQrFeedback(null);

    const authError = requireWalletAuthentication(user, walletId, "Generating a QR token");
    if (authError) {
      setQrFeedback({ type: "error", message: authError });
      return;
    }

    if (!couponId) {
      setQrFeedback({ type: "error", message: "Select a coupon before generating a QR token." });
      return;
    }

    const trimmedWalletId = walletId.trim();
    if (!trimmedWalletId) {
      setQrFeedback({ type: "error", message: "Generating a QR token requires a wallet. Enter a wallet ID first." });
      return;
    }

    qrMutation.mutate({ walletId: trimmedWalletId, couponId });
  };

  const clearQrState = () => {
    setQrFeedback(null);
    setQrResult(null);
  };

  return { qrFeedback, qrResult, qrMutation, generateQrForCoupon, clearQrState };
}

type RedeemTokenOptions = {
  walletId: string;
  refetchWallet: RefetchWallet;
  onRedeemSuccess?: RedeemSuccessHandler;
};

export function useRedeemToken({ walletId, refetchWallet, onRedeemSuccess }: RedeemTokenOptions) {
  const [qrTokenInput, setQrTokenInput] = useState("");
  const [redeemFeedback, setRedeemFeedback] = useState<Feedback | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResponse | null>(null);

  useEffect(() => {
    setRedeemFeedback(null);
    setRedeemResult(null);
  }, [walletId]);

  const redeemMutation = useMutation<RedeemResponse, ApiError, { walletId: string; token: string }>({
    mutationFn: async ({ walletId: wallet, token }) => {
      const response = await fetch(`/api/wallet/${wallet}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      return parseJsonResponse<RedeemResponse>(response);
    },
    onSuccess: (data) => {
      setRedeemResult(data);
      setRedeemFeedback({
        type: "success",
        message: data.coupon
          ? `Coupon ${data.coupon.code} redeemed at ${formatDateTime(data.redeemedAt)}`
          : `QR token redeemed at ${formatDateTime(data.redeemedAt)}`,
      });
      refetchWallet();
      onRedeemSuccess?.();
    },
    onError: (error) => {
      const subscriptionStatus = extractSubscriptionStatus(error.payload);
      setRedeemFeedback({ type: "error", message: error.message, subscriptionStatus });
    },
  });

  const handleRedeemSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRedeemFeedback(null);

    if (!walletId.trim() || !qrTokenInput.trim()) {
      setRedeemFeedback({ type: "error", message: "walletId and QR token are required" });
      return;
    }

    redeemMutation.mutate({ walletId: walletId.trim(), token: qrTokenInput.trim() });
  };

  return {
    qrTokenInput,
    setQrTokenInput,
    redeemFeedback,
    redeemResult,
    redeemMutation,
    handleRedeemSubmit,
  };
}

export function activeTokenMatchesCoupon(
  activeQrToken: ActiveQrToken | null,
  selectedEntry: WalletCouponEntry | null,
) {
  return Boolean(
    activeQrToken &&
      selectedEntry &&
      activeQrToken.couponId &&
      activeQrToken.couponId === selectedEntry.couponId,
  );
}
