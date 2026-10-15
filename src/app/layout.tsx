import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { BillingProvider } from "@/components/BillingContext";
import { ProfileProvider } from "@/components/ProfileContext";
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
  title: "Rebban — From proposal to paid",
  description:
    "Create professional proposals, track your time, invoice clients, and let automated reminders follow up until you get paid.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`${satoshi.className} h-screen bg-[#F0F1F3] text-gray-900 overflow-hidden selection:bg-blue-100`}>
        <ProfileProvider>
          <BillingProvider>
            <TimeTrackingProvider>
              <AppShell>{children}</AppShell>
            </TimeTrackingProvider>
          </BillingProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
