"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/types/database";

type OrganizationType = Enums<"organization_type">;

type ProfileState = {
  userId: string | null;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  organizationId: string | null;
  organizationType: OrganizationType | null;
  organizationDescription: string | null;
  organizationCurrency: string | null;
  logoUrl: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<ProfileState | null>(null);

async function resolveStorageUrl(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  pathOrUrl: string | null
) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(pathOrUrl, 60 * 60 * 24);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationType, setOrganizationType] =
    useState<OrganizationType | null>(null);
  const [organizationDescription, setOrganizationDescription] = useState<
    string | null
  >(null);
  const [organizationCurrency, setOrganizationCurrency] = useState<
    string | null
  >(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId(null);
      setFullName(null);
      setEmail(null);
      setAvatarUrl(null);
      setOrganizationId(null);
      setOrganizationType(null);
      setOrganizationDescription(null);
      setOrganizationCurrency(null);
      setLogoUrl(null);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, avatar_url, active_organization_id")
      .eq("id", user.id)
      .maybeSingle();

    const signedAvatar = await resolveStorageUrl(
      supabase,
      "avatars",
      profile?.avatar_url ?? null
    );

    let orgId = profile?.active_organization_id ?? null;
    let orgType: OrganizationType | null = null;
    let orgDescription: string | null = null;
    let orgCurrency: string | null = null;
    let signedLogo: string | null = null;

    if (!orgId) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      orgId = membership?.organization_id ?? null;
    }

    if (orgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id, type, description, logo_url, currency")
        .eq("id", orgId)
        .maybeSingle();

      if (org) {
        orgType = org.type;
        orgDescription = org.description;
        orgCurrency = org.currency;
        signedLogo = await resolveStorageUrl(
          supabase,
          "org-assets",
          org.logo_url
        );
      }
    }

    setUserId(user.id);
    setFullName(profile?.full_name ?? user.user_metadata?.full_name ?? null);
    setEmail(profile?.email ?? user.email ?? null);
    setAvatarUrl(signedAvatar);
    setOrganizationId(orgId);
    setOrganizationType(orgType);
    setOrganizationDescription(orgDescription);
    setOrganizationCurrency(orgCurrency);
    setLogoUrl(signedLogo);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  return (
    <ProfileContext.Provider
      value={{
        userId,
        fullName,
        email,
        avatarUrl,
        organizationId,
        organizationType,
        organizationDescription,
        organizationCurrency,
        logoUrl,
        loading,
        refresh,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
