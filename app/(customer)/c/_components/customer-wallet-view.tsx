"use client";

import { useAuth } from "@/lib/auth-context";

import { CouponActionsSection } from "./customer-wallet-coupon-actions";
import { RedeemSection } from "./customer-wallet-redeem-section";
import { WalletOverviewSection } from "./customer-wallet-overview-section";
import {
  activeTokenMatchesCoupon,
  useClaimCoupon,
  useCouponSelection,
  useQrToken,
  useRedeemToken,
  useWalletIdForm,
} from "./use-customer-wallet-controls";
import { useCustomerWallet, type WalletCouponEntry } from "./use-wallet";

const EMPTY_ENTRIES: WalletCouponEntry[] = [];

export function CustomerWalletView() {
  const { user } = useAuth();

  const { walletId, walletIdInput, setWalletIdInput, handleWalletIdSubmit } = useWalletIdForm(
    user?.defaultWalletId,
  );
  const walletQuery = useCustomerWallet(walletId);
  const entries = walletQuery.data?.entries ?? EMPTY_ENTRIES;

  const { selectedCouponId, setSelectedCouponId, selectedEntry } = useCouponSelection(entries);

  const refetchWallet = () => {
    if (walletId.trim()) {
      void walletQuery.refetch();
    }
  };

  const qrToken = useQrToken({
    user,
    walletId,
    refetchWallet,
  });

  const claimCoupon = useClaimCoupon({
    user,
    walletId,
    onCouponClaimed: (couponId) => {
      setSelectedCouponId(couponId);
      qrToken.clearQrState();
    },
    refetchWallet,
  });

  const redeemToken = useRedeemToken({
    walletId,
    refetchWallet,
    onRedeemSuccess: () => {
      qrToken.clearQrState();
    },
  });

  const activeQrToken = walletQuery.data?.activeQrToken ?? null;
  const tokenMatchesSelection = activeTokenMatchesCoupon(activeQrToken, selectedEntry);

  const handleClaimSelected = () => {
    claimCoupon.claimSelectedCoupon(selectedEntry ? selectedEntry.couponId : null);
  };

  const handleGenerateQr = () => {
    qrToken.generateQrForCoupon(selectedEntry ? selectedEntry.couponId : null);
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Wallet actions</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Manage coupon claims, QR tokens, and redemption events. Merchant subscription status determines access to each feature.
        </p>
      </header>

      <div className="space-y-6">
        <WalletOverviewSection
          walletId={walletId}
          walletIdInput={walletIdInput}
          onWalletIdInputChange={(value) => setWalletIdInput(value)}
          onWalletSubmit={handleWalletIdSubmit}
          onRefreshWallet={refetchWallet}
          isFetchingWallet={walletQuery.isFetching}
          isLoadingWallet={walletQuery.isLoading}
          walletError={walletQuery.error}
          walletStatus={walletQuery.data?.wallet.status ?? null}
          claimCouponId={claimCoupon.claimCouponId}
          onClaimCouponIdChange={(value) => claimCoupon.setClaimCouponId(value)}
          onClaimSubmit={claimCoupon.handleManualClaimSubmit}
          claimPending={claimCoupon.claimMutation.isPending}
          claimFeedback={claimCoupon.claimFeedback}
          entries={entries}
          selectedCouponId={selectedCouponId}
          onSelectCoupon={(couponId) => setSelectedCouponId(couponId)}
        />

        <CouponActionsSection
          selectedEntry={selectedEntry}
          activeQrToken={activeQrToken}
          activeTokenMatchesSelection={tokenMatchesSelection}
          onClaimSelected={handleClaimSelected}
          onGenerateQr={handleGenerateQr}
          claimPending={claimCoupon.claimMutation.isPending}
          qrPending={qrToken.qrMutation.isPending}
          qrResult={qrToken.qrResult}
          qrFeedback={qrToken.qrFeedback}
        />

        <RedeemSection
          walletId={walletId}
          qrTokenInput={redeemToken.qrTokenInput}
          onQrTokenInputChange={(value) => redeemToken.setQrTokenInput(value)}
          onRedeemSubmit={redeemToken.handleRedeemSubmit}
          redeemPending={redeemToken.redeemMutation.isPending}
          redeemResult={redeemToken.redeemResult}
          redeemFeedback={redeemToken.redeemFeedback}
        />
      </div>
    </section>
  );
}
