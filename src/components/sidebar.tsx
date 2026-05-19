"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FileText,
  BookOpen,
  ShieldCheck,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Landmark,
  LogOut
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Cash Flow", href: "/cashflow", icon: ArrowLeftRight },
  { name: "Invoicing", href: "/invoicing", icon: FileText },
  { name: "General Ledger", href: "/ledger", icon: BookOpen },
  { name: "Audit & Compliance", href: "/audit", icon: ShieldCheck },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

export function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "flex flex-col bg-white border-r border-slate-200 transition-all duration-300",
        collapsed ? "w-20" : "w-64",
        className
      )}
    >
      {/* Logo */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Landmark className="w-6 h-6 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-lg text-slate-900 leading-tight whitespace-nowrap">
                FinManage
              </h1>
              <p className="text-xs text-slate-500 whitespace-nowrap">Enterprise v1.0</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  collapsed && "justify-center px-2"
                )}
                title={collapsed ? item.name : undefined}
              >
                <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-blue-600" : "text-slate-400")} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-200">
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-3 rounded-lg bg-slate-50",
            collapsed && "justify-center px-2"
          )}
        >
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-semibold">
              MR
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">Michael Roberts</p>
              <p className="text-xs text-slate-500">CFO</p>
            </div>
          )}
          {!collapsed && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-slate-500" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-slate-500" />
        )}
      </button>
    </div>
  );
}
