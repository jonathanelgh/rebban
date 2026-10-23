import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { BillingProvider } from "@/components/BillingContext";
import { CookieConsent } from "@/components/CookieConsent";
import { InternalAnalytics } from "@/components/InternalAnalytics";
import { ProfileProvider } from "@/components/ProfileContext";
import { MobileSessionBridge } from "@/components/MobileSessionBridge";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { PwaRegister } from "@/components/PwaRegister";
import { TimeTrackingProvider } from "@/components/TimeTrackingContext";

const satoshi = localFont({
  src: [
    {
      path: "./fonts/Satoshi-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/Satoshi-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Satoshi-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/Satoshi-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/Satoshi-Black.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Rebban",
  title: "Rebban — From proposal to paid",
  description:
    "Create professional proposals, track your time, invoice clients, and let automated reminders follow up until you get paid.",
  appleWebApp: {
    capable: true,
    title: "Rebban",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/rebban-icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F0F1F3" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className={`${satoshi.className} h-dvh bg-[#F0F1F3] text-gray-900 overflow-hidden selection:bg-blue-100`}
      >
        <ProfileProvider>
          <BillingProvider>
            <TimeTrackingProvider>
              <AppShell>{children}</AppShell>
              <InternalAnalytics />
              <CookieConsent />
              <MobileSessionBridge />
              <PwaRegister />
              <PwaInstallBanner />
            </TimeTrackingProvider>
          </BillingProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
