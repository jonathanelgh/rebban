type TrackPayload = {
  path?: string;
  title?: string;
  referrer?: string;
  host?: string;
  slug?: string;
};

export function trackInternalPageView(payload?: TrackPayload) {
  if (typeof window === "undefined") return;
  const hostname = window.location.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return;
  }
  const path = payload?.path || window.location.pathname;
  const body = {
    path,
    title: payload?.title || document.title,
    referrer: payload?.referrer ?? document.referrer,
    host: payload?.host || window.location.host,
    slug: payload?.slug,
  };
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([json], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/collect", blob)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch("/api/analytics/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}
