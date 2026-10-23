"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Lets the Expo WebView / in-app browser hydrate a Supabase session from
 * `?mobile=1#access_token=…` (or `access_token` query) so editors and
 * settings work when opened from the native app.
 */
export function MobileSessionBridge() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const mobile = params.get("mobile") === "1";
    const access_token =
      hashParams.get("access_token") ||
      params.get("access_token") ||
      "";
    const refresh_token =
      hashParams.get("refresh_token") ||
      params.get("refresh_token") ||
      "";

    if (!mobile || !access_token) return;

    const supabase = createClient();
    void (async () => {
      if (refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      } else {
        // Access token alone — still set so getUser works for this tab.
        await supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token || access_token,
        });
      }

      // Clean tokens out of the URL without reloading.
      const url = new URL(window.location.href);
      url.searchParams.delete("access_token");
      url.searchParams.delete("refresh_token");
      url.hash = "";
      window.history.replaceState({}, "", url.pathname + url.search);
    })();
  }, []);

  return null;
}
