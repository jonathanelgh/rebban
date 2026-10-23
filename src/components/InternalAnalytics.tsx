"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackInternalPageView } from "@/lib/analytics/client";
import { shouldSkipPath } from "@/lib/analytics/internal";

export function InternalAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || shouldSkipPath(pathname)) return;
    const timer = window.setTimeout(() => {
      trackInternalPageView({ path: pathname });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
