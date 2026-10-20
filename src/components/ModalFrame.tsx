"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Full-screen backdrop: bottom sheet on mobile, centered card on sm+. */
export const modalOverlayClass =
  "fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/40 backdrop-blur-sm overflow-x-hidden";

/**
 * Panel shell. Pass a max-w-* class as a full static string (e.g. max-w-[520px])
 * so Tailwind can emit it. Do not interpolate the class name.
 */
export function modalPanelClass(maxWidthClass: string, extra = "") {
  return [
    "rebban-modal-panel",
    "relative bg-white rounded-t-[1.75rem] sm:rounded-3xl border border-line",
    "w-full min-w-0",
    maxWidthClass,
    "max-h-[min(92dvh,92vh)] overflow-hidden overflow-x-hidden flex flex-col",
    "shadow-[0_24px_60px_rgba(16,24,40,0.16)]",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export const modalHeaderClass =
  "px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3 shrink-0 min-w-0";

export const modalBodyClass =
  "px-5 sm:px-6 pb-2 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0";

export const modalFooterClass =
  "px-5 sm:px-6 py-4 border-t border-line flex flex-wrap items-center justify-end gap-2.5 shrink-0 min-w-0";

export function ModalOverlay({
  children,
  onClose,
  zClass = "z-[80]",
}: {
  children: React.ReactNode;
  onClose?: () => void;
  zClass?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Portal to body so `fixed` is viewport-relative. AppShell uses transform on
  // mobile for the slide-nav, which would otherwise trap fixed descendants in
  // a container wider than the screen.
  const overlay = (
    <div className={`${modalOverlayClass} ${zClass}`}>
      {onClose ? (
        <div
          className="absolute inset-0 z-0"
          onClick={onClose}
          aria-hidden
        />
      ) : null}
      {/*
        Keep the panel above the full-screen backdrop. Without this, mobile
        Safari sometimes delivers taps on footer buttons to the backdrop
        instead (modal closes / action never runs).
      */}
      <div className="relative z-10 w-full min-w-0 flex justify-center items-end sm:items-center pointer-events-none">
        <div className="pointer-events-auto w-full min-w-0 flex justify-center items-end sm:items-center">
          {children}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(overlay, document.body);
}
