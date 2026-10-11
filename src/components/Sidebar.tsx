"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  FileText,
  FileSpreadsheet,
  CreditCard,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeft,
  CheckCircle2,
  Send,
  Eye,
  Zap,
  Timer
} from "lucide-react";
import { useTimeTracking, formatElapsed } from "@/components/TimeTrackingContext";

function SidebarInner() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { isTracking, elapsedSeconds } = useTimeTracking();

  // Hide the global sidebar if we are in the proposal editor, 
  // since the editor provides its own full-screen focused layout.
  if (pathname.includes('/edit')) return null;

  return (
    <aside className={`bg-white border-r border-gray-100 flex flex-col justify-between overflow-y-auto transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'} shrink-0`}>
      <div>
        {/* Profile */}
        <div className={`p-4 flex items-center mt-2 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex items-center gap-3 ${isCollapsed ? 'hidden' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
              <img
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sam"
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-medium text-sm whitespace-nowrap">Sam Smith</span>
          </div>
          {isCollapsed && (
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0 mb-4 absolute top-6">
              <img
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sam"
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`text-gray-400 hover:text-gray-600 transition-colors ${isCollapsed ? 'mt-12' : ''}`}
          >
            {isCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-2 mt-4 space-y-1">
          <NavItem href="/" icon={<Home className="w-4 h-4" />} label="Dashboard" active={pathname === "/"} isCollapsed={isCollapsed} />
          <NavItem href="/clients" icon={<Users className="w-4 h-4" />} label="Clients" active={pathname === "/clients"} isCollapsed={isCollapsed} />
          <NavItem href="/proposals" icon={<FileText className="w-4 h-4" />} label="Proposals" active={pathname === "/proposals"} isCollapsed={isCollapsed} />
          <NavItem href="/invoices" icon={<FileSpreadsheet className="w-4 h-4" />} label="Invoices" active={pathname === "/invoices"} isCollapsed={isCollapsed} />
          <NavItem href="/payments" icon={<CreditCard className="w-4 h-4" />} label="Payments" active={pathname === "/payments"} isCollapsed={isCollapsed} />
          <NavItem
            href="/time-tracking"
            icon={<Timer className="w-4 h-4" />}
            label="Time Tracking"
            active={pathname === "/time-tracking"}
            isCollapsed={isCollapsed}
            badge={isTracking ? formatElapsed(elapsedSeconds) : undefined}
            badgeLive={isTracking}
          />
        </nav>

        {/* Activity / History */}
        {!isCollapsed && (
          <div className="px-4 mt-8 transition-opacity duration-300">
            <h3 className="text-xs text-gray-400 font-medium mb-3">Recent Activity</h3>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-center gap-2 truncate cursor-pointer hover:text-black transition-colors">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                Stripe payout received
              </li>
              <li className="flex items-center gap-2 truncate cursor-pointer hover:text-black transition-colors">
                <Eye className="w-3 h-3 text-blue-500" />
                Acme Corp viewed INV-1042
              </li>
              <li className="flex items-center gap-2 truncate cursor-pointer hover:text-black transition-colors">
                <Send className="w-3 h-3 text-gray-400" />
                Reminder sent to Globex
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Bottom Sidebar */}
      <div className="p-4 space-y-4">
        {!isCollapsed && (
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 transition-opacity duration-300">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold whitespace-nowrap">Autopilot Active</span>
            </div>
            <p className="text-xs text-gray-500 mb-3 ml-6 whitespace-nowrap">Chasing 3 overdue invoices</p>
            <button className="w-full bg-[#3B82F6] hover:bg-blue-600 text-white rounded-xl py-2 text-sm font-medium transition-colors">
              View Sequence
            </button>
          </div>
        )}
        
        <div className={`flex items-center cursor-pointer text-gray-600 hover:text-gray-900 ${isCollapsed ? 'justify-center' : 'justify-between px-2'}`}>
          {!isCollapsed && <span className="text-sm">Settings</span>}
          <MoreHorizontal className="w-4 h-4" />
        </div>
      </div>
    </aside>
  );
}

export function Sidebar() {
  return (
    <Suspense fallback={<aside className="bg-white border-r border-gray-100 w-64 shrink-0"></aside>}>
      <SidebarInner />
    </Suspense>
  );
}

function NavItem({
  icon,
  label,
  href,
  active = false,
  isCollapsed = false,
  badge,
  badgeLive = false,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
  isCollapsed?: boolean;
  badge?: string;
  badgeLive?: boolean;
}) {
  return (
    <Link 
      href={href}
      className={`flex items-center gap-3 py-2 rounded-xl cursor-pointer transition-colors ${
        badgeLive && !active
          ? "bg-emerald-50/80 text-emerald-700 hover:bg-emerald-50"
          : active
            ? "bg-gray-100 text-gray-900 font-medium"
            : "text-gray-600 hover:bg-gray-50"
      } ${isCollapsed ? "justify-center px-0" : "px-3"}`}
      title={isCollapsed ? (badge ? `${label} · ${badge}` : label) : undefined}
    >
      <div className="relative flex items-center justify-center w-5">
        {icon}
        {isCollapsed && badgeLive && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
      </div>
      {!isCollapsed && (
        <>
          <span className="text-sm whitespace-nowrap flex-1">{label}</span>
          {badge && (
            <span className="text-[11px] font-mono font-semibold tabular-nums text-emerald-600 bg-white border border-emerald-100 px-1.5 py-0.5 rounded-md">
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
