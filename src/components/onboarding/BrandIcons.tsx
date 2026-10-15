import React from "react";

export function GmailIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 12.713 1.5 5.25V18.75c0 .825.675 1.5 1.5 1.5h3.75V11.1L12 15.6l5.25-4.5V20.25H21c.825 0 1.5-.675 1.5-1.5V5.25L12 12.713Z"
      />
      <path
        fill="#34A853"
        d="M21 3.75H18.75L12 8.85 5.25 3.75H3c-.45 0-.862.2-1.125.525L12 12.713 22.125 4.275A1.49 1.49 0 0 0 21 3.75Z"
      />
      <path fill="#FBBC04" d="M3 3.75v14.4l3.75-3.225V3.75H3Z" />
      <path fill="#C5221F" d="M21 3.75h-3.75v11.175L21 18.15V3.75Z" />
      <path
        fill="#4285F4"
        d="M1.875 4.275A1.49 1.49 0 0 0 1.5 5.25v13.5c0 .825.675 1.5 1.5 1.5h3.75V11.1L1.875 4.275Z"
      />
    </svg>
  );
}

export function OutlookIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="5" fill="#0078D4" />
      <path
        fill="#fff"
        d="M6.2 7.4h5.1c1.85 0 3.05 1.05 3.05 2.55 0 1.05-.62 1.88-1.55 2.22v.05c1.2.32 1.98 1.25 1.98 2.55 0 1.72-1.35 2.85-3.45 2.85H6.2V7.4Zm2.15 1.75v2.2h2.55c.95 0 1.5-.48 1.5-1.15 0-.65-.55-1.05-1.48-1.05H8.35Zm0 3.85v2.55h2.85c1.05 0 1.68-.5 1.68-1.28 0-.78-.62-1.27-1.72-1.27H8.35Z"
      />
    </svg>
  );
}

export function StripeIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#635BFF" />
      <path
        fill="#fff"
        d="M11.3 9.55c0-.55.45-.77 1.18-.77 1.06 0 2.4.32 3.46.9V6.95A9.3 9.3 0 0 0 12.4 6.3c-2.95 0-4.92 1.54-4.92 4.12 0 4.02 5.54 3.38 5.54 5.12 0 .65-.56.87-1.34.87-1.15 0-2.63-.47-3.8-1.11v2.78a10.1 10.1 0 0 0 3.95.8c3.05 0 5.15-1.5 5.15-4.14 0-4.33-5.68-3.56-5.68-5.19Z"
      />
    </svg>
  );
}

export function RebbanMark({
  className = "w-12 h-12 text-[18px]",
}: {
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-gray-950 text-white flex items-center justify-center shrink-0 font-semibold tracking-tight leading-none ${className}`}
    >
      R.
    </div>
  );
}
