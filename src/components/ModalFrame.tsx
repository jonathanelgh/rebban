import React from "react";

/** Full-screen backdrop: bottom sheet on mobile, centered card on sm+. */
export const modalOverlayClass =
  "fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/40 backdrop-blur-sm overflow-x-hidden";

/**
 * Panel shell. Pass a max-w-* class (e.g. max-w-[520px]).
 * Width is always capped to the viewport so form controls cannot blow out mobile.
 */
export function modalPanelClass(maxWidthClass: string, extra = "") {
  const px = maxWidthClass.match(/^max-w-\[(\d+)px\]$/)?.[1];
  // Cap every panel to the viewport so mobile sheets never grow past the screen.
  const resolvedMax = px ? `max-w-[min(100vw,${px}px)]` : maxWidthClass;

  return [
    "rebban-modal-panel",
    "relative bg-white rounded-t-[1.75rem] sm:rounded-3xl border border-line",
    "w-full min-w-0",
    resolvedMax,
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
  return (
    <div className={`${modalOverlayClass} ${zClass}`}>
      {onClose ? (
        <div className="absolute inset-0" onClick={onClose} aria-hidden />
      ) : null}
      {children}
    </div>
  );
}
