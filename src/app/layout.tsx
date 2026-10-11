import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { GlobalChatBar } from "@/components/GlobalChatBar";
import { TimeTrackingProvider } from "@/components/TimeTrackingContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Freelancer Pay - Proposal & Invoicing",
  description: "Send the invoice. We chase the payment.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-screen bg-white text-gray-900 font-sans overflow-hidden selection:bg-blue-100">
        <TimeTrackingProvider>
          <SidebarWrapper>
            {children}
          </SidebarWrapper>
          <GlobalChatBar />
        </TimeTrackingProvider>
      </body>
    </html>
  );
}

function SidebarWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full h-full relative z-0">
      <Sidebar />
      <div className="flex-1 flex flex-col relative overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
