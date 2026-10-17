"use client";

import React, { useEffect, useState } from "react";
import Script from "next/script";
import {
  COOKIE_PREFERENCES_EVENT,
  acceptAllCookies,
  readCookieConsent,
  rejectNonEssentialCookies,
  writeCookieConsent,
  type CookieConsentPreferences,
} from "@/lib/cookies/consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export function CookieConsent() {
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<CookieConsentPreferences | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftMarketing, setDraftMarketing] = useState(false);

  useEffect(() => {
    const existing = readCookieConsent();
    setPrefs(existing);
    if (existing) {
      setDraftAnalytics(existing.analytics);
      setDraftMarketing(existing.marketing);
    }
    setReady(true);

    function onOpenPreferences() {
      const current = readCookieConsent();
      setDraftAnalytics(current?.analytics ?? false);
      setDraftMarketing(current?.marketing ?? false);
      setPanelOpen(true);
    }

    window.addEventListener(COOKIE_PREFERENCES_EVENT, onOpenPreferences);
    return () => {
      window.removeEventListener(COOKIE_PREFERENCES_EVENT, onOpenPreferences);
    };
  }, []);

  function applyPrefs(next: CookieConsentPreferences) {
    setPrefs(next);
    setDraftAnalytics(next.analytics);
    setDraftMarketing(next.marketing);
    setPanelOpen(false);
  }

  if (!ready) return null;

  const showBanner = !prefs && !panelOpen;
  const loadAnalytics = Boolean(prefs?.analytics && GA_ID);
  const loadMarketing = Boolean(prefs?.marketing && META_PIXEL_ID);

  return (
    <>
      {loadAnalytics && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="rebban-ga" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {loadMarketing && (
        <Script id="rebban-meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
            (window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {showBanner && (
        <div className="fixed inset-x-0 bottom-0 z-[80] p-4 sm:p-6 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-[0_8px_30px_rgba(16,24,40,0.12)]">
            <p className="text-[14px] font-semibold text-gray-900 tracking-tight">
              Cookies
            </p>
            <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">
              We use essential cookies to run Rebban, and optional analytics and
              marketing cookies (Google Analytics, Meta Pixel) to understand usage
              and measure ads. See our{" "}
              <a
                href="https://rebban.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#2563EB] hover:text-[#1d4ed8]"
              >
                Privacy Policy
              </a>
              .
            </p>
            <div className="mt-4 flex flex-col-reverse sm:flex-row sm:flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setDraftAnalytics(false);
                  setDraftMarketing(false);
                  setPanelOpen(true);
                }}
                className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Customize
              </button>
              <button
                type="button"
                onClick={() => applyPrefs(rejectNonEssentialCookies())}
                className="rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium text-gray-800 hover:bg-[#FAFBFC] transition-colors"
              >
                Essential only
              </button>
              <button
                type="button"
                onClick={() => applyPrefs(acceptAllCookies())}
                className="btn-primary rounded-xl px-3.5 py-2.5 text-sm"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-prefs-title"
            className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(16,24,40,0.16)]"
          >
            <h2
              id="cookie-prefs-title"
              className="text-[16px] font-semibold text-gray-900 tracking-tight"
            >
              Cookie preferences
            </h2>
            <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">
              Choose which optional cookies to allow. Essential cookies are always
              on.
            </p>

            <div className="mt-4 space-y-1 border border-line rounded-2xl divide-y divide-line">
              <PreferenceRow
                label="Essential"
                description="Sign-in, security, and core app features"
                active
                locked
              />
              <PreferenceRow
                label="Analytics"
                description="Google Analytics — usage and product insights"
                active={draftAnalytics}
                onChange={setDraftAnalytics}
              />
              <PreferenceRow
                label="Marketing"
                description="Meta Pixel — ad measurement and conversions"
                active={draftMarketing}
                onChange={setDraftMarketing}
              />
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!prefs) {
                    setPanelOpen(false);
                    return;
                  }
                  setDraftAnalytics(prefs.analytics);
                  setDraftMarketing(prefs.marketing);
                  setPanelOpen(false);
                }}
                className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPrefs(
                    writeCookieConsent({
                      analytics: draftAnalytics,
                      marketing: draftMarketing,
                    })
                  )
                }
                className="btn-primary rounded-xl px-3.5 py-2.5 text-sm"
              >
                Save preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PreferenceRow({
  label,
  description,
  active,
  locked,
  onChange,
}: {
  label: string;
  description: string;
  active: boolean;
  locked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-gray-900">{label}</div>
        <div className="text-[12px] text-gray-500 mt-0.5 leading-snug">
          {description}
        </div>
      </div>
      {locked ? (
        <span className="text-[12px] font-medium text-gray-400 shrink-0">
          Always on
        </span>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={active}
          onClick={() => onChange?.(!active)}
          className={`w-11 h-6 rounded-full flex items-center p-0.5 transition-colors shrink-0 ${
            active ? "bg-[#2563EB]" : "bg-gray-300"
          }`}
        >
          <span
            className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${
              active ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      )}
    </div>
  );
}
