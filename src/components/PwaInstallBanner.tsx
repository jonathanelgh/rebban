"use client";

import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "rebban-pwa-install-dismissed";

/**
 * Android/Chrome install prompt. iOS uses Share → Add to Home Screen
 * (no beforeinstallprompt), so we show a short tip there instead.
 */
export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [iosTip, setIosTip] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (
      "standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone
    ) {
      return;
    }
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !("MSStream" in window);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      setIosTip(true);
      setVisible(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    setVisible(false);
    setDeferred(null);
    setIosTip(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-3 sm:inset-x-auto sm:right-4 sm:left-auto z-[70] max-w-md mx-auto sm:mx-0">
      <div className="rounded-2xl border border-line bg-white shadow-[0_16px_48px_rgba(16,24,40,0.18)] p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shrink-0 font-semibold tracking-tight">
          R.
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-gray-900">
            Install Rebban
          </div>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">
            {iosTip
              ? "Tap Share, then Add to Home Screen for the full app experience."
              : "Add Rebban to your home screen for faster access."}
          </p>
          {!iosTip && deferred ? (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-2.5 inline-flex items-center gap-1.5 btn-primary px-3.5 py-2 rounded-full text-[13px]"
            >
              <Download className="w-3.5 h-3.5" />
              Install app
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1.5 -mr-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-50 shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
