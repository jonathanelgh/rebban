"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useProfile } from "@/components/ProfileContext";
import { computeEntitlement } from "@/lib/billing/plan";
import type { PlatformPricing } from "@/lib/stripe/prices";

type BillingState = {
  loading: boolean;
  configured: boolean;
  yearlyConfigured: boolean;
  entitled: boolean;
  paid: boolean;
  trialActive: boolean;
  trialExpired: boolean;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  planLabel: string;
  subscriptionStatus: string | null;
  pricing: PlatformPricing | null;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
  upgradeModalOpen: boolean;
  refreshBilling: () => Promise<void>;
};

const EMPTY_PRICING: PlatformPricing = {
  monthly: null,
  yearly: null,
  yearlyPerMonth: null,
  yearlySavings: null,
};

const BillingContext = createContext<BillingState | null>(null);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { organizationId, loading: profileLoading } = useProfile();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [yearlyConfigured, setYearlyConfigured] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    null
  );
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PlatformPricing | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const refreshBilling = useCallback(async () => {
    if (!organizationId) {
      setConfigured(false);
      setYearlyConfigured(false);
      setSubscriptionStatus(null);
      setTrialEndsAt(null);
      setPricing(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/stripe/billing/status");
      const json = await res.json();
      if (!res.ok) {
        setConfigured(false);
        setYearlyConfigured(false);
        setSubscriptionStatus(null);
        setTrialEndsAt(null);
        setPricing(null);
        return;
      }
      setConfigured(Boolean(json.configured));
      setYearlyConfigured(Boolean(json.yearlyConfigured));
      setSubscriptionStatus(json.status ?? null);
      setTrialEndsAt(json.trialEndsAt ?? null);
      setPricing((json.pricing as PlatformPricing | null) ?? EMPTY_PRICING);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (profileLoading) return;
    void refreshBilling();
  }, [profileLoading, refreshBilling]);

  const entitlement = useMemo(
    () =>
      computeEntitlement({
        subscriptionStatus,
        trialEndsAt,
      }),
    [subscriptionStatus, trialEndsAt]
  );

  const value = useMemo<BillingState>(
    () => ({
      loading: profileLoading || loading,
      configured,
      yearlyConfigured,
      entitled: entitlement.entitled,
      paid: entitlement.paid,
      trialActive: entitlement.trialActive,
      trialExpired: entitlement.trialExpired,
      trialDaysLeft: entitlement.trialDaysLeft,
      trialEndsAt: entitlement.trialEndsAt,
      planLabel: entitlement.planLabel,
      subscriptionStatus,
      pricing,
      openUpgradeModal: () => setUpgradeModalOpen(true),
      closeUpgradeModal: () => setUpgradeModalOpen(false),
      upgradeModalOpen,
      refreshBilling,
    }),
    [
      profileLoading,
      loading,
      configured,
      yearlyConfigured,
      entitlement,
      subscriptionStatus,
      pricing,
      upgradeModalOpen,
      refreshBilling,
    ]
  );

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error("useBilling must be used within BillingProvider");
  }
  return ctx;
}
