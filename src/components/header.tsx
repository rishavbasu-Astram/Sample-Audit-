"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bell, Plus, Search } from "lucide-react";

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Real-time financial overview" },
  "/cashflow": { title: "Cash Flow Management", subtitle: "Track AR/AP and forecast liquidity" },
  "/invoicing": { title: "Invoicing & Billing", subtitle: "Manage invoices and recurring billing" },
  "/ledger": { title: "General Ledger", subtitle: "Double-entry bookkeeping and journal entries" },
  "/audit": { title: "Audit & Compliance", subtitle: "Immutable trails and regulatory controls" },
  "/reports": { title: "Reports & Analytics", subtitle: "Financial statements and variance analysis" },
};

export function Header() {
  const pathname = usePathname();
  const pageInfo = pageTitles[pathname] || { title: "Dashboard", subtitle: "" };

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{pageInfo.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{pageInfo.subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search transactions, invoices..."
              className="pl-10 pr-4 py-2 w-80 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50"
            />
          </div>
          <button className="relative p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Transaction</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
