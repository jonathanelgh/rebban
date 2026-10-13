"use client";

import React from "react";
import { User } from "lucide-react";

type UserAvatarProps = {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-16 h-16",
} as const;

const ICON_SIZES = {
  sm: "w-5 h-5",
  md: "w-6 h-6",
  lg: "w-7 h-7",
} as const;

export function UserAvatar({
  src,
  alt = "Profile",
  size = "sm",
  className = "",
}: UserAvatarProps) {
  return (
    <div
      className={`${SIZES[size]} rounded-full overflow-hidden border border-black/[0.06] bg-[#F3F4F6] flex items-center justify-center shrink-0 ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <User className={`${ICON_SIZES[size]} text-gray-400`} strokeWidth={1.75} />
      )}
    </div>
  );
}
