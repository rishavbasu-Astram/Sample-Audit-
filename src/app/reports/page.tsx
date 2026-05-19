"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  mockBudgetVariance,
  formatCurrency,
  getStatusColor,
} from "@/data/mockData";
import {
  TrendingUp,
  Scale,
  Banknote,
  Download,
} from "lucide-react";

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<string | null>(null);

  const reports = {
    pnl: {
      title: "Profit & Loss Statement",
      subtitle: "For the period January 1, 2026 to April 30, 2026",
      icon: TrendingUp,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-50",
    },
    balance: {
      title: "Balance Sheet",
      subtitle: "As of April 30, 2026",
      icon: Scale,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    cashflow: {
      title: "Cash Flow Statement",
      subtitle: "For the period January 1, 2026 to April 30, 2026",
      icon: Banknote,
      iconColor: "text-purple-600",
      iconBg: "bg-purple-50",
    },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Financial Statements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Object.entries(reports).map(([key, report]) => {
          const Icon = report.icon;
          return (
            <Card
              key={key}
              className="cursor-pointer hover:shadow-lg transition-all duration-200"
              onClick={() => setActiveReport(key)}
            >
              <CardContent className="p-6">
                <div className={`w-12 h-12 ${report.iconBg} rounded-lg flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${report.iconColor}`} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{report.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{report.subtitle}</p>
                <p className="text-xs text-slate-400 mt-3">Last updated: May 8, 2026</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Budget vs Actual */}
      <Card>
        <CardHeader>
          <CardTitle>Budget vs Actual Variance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Account</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Budgeted</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actual</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Variance</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">%</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockBudgetVariance.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.accountName}</td>
                    <td className="px-6 py-4 text-sm text-right text-slate-500">{formatCurrency(item.budgeted)}</td>
                    <td className="px-6 py-4 text-sm text-right text-slate-900">{formatCurrency(item.actual)}</td>
                    <td className={`px-6 py-4 text-sm text-right font-medium ${item.variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {item.variance >= 0 ? "+" : ""}{formatCurrency(item.variance)}
                    </td>
                    <td className={`px-6 py-4 text-sm text-right ${item.variancePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {item.variancePercent >= 0 ? "+" : ""}{item.variancePercent.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant="outline" className={getStatusColor(item.status)}>{item.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Report Dialog */}
      <Dialog open={!!activeReport} onOpenChange={() => setActiveReport(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div>
              <DialogTitle>{activeReport ? reports[activeReport as keyof typeof reports].title : ""}</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">
                {activeReport ? reports[activeReport as keyof typeof reports].subtitle : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => alert("Report exported to PDF")}>
              <Download className="w-4 h-4" /> Export
            </Button>
          </DialogHeader>

          {activeReport === "pnl" && (
            <div className="space-y-4 py-4">
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Revenue</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Software Revenue</span><span className="text-sm font-medium text-slate-900">{formatCurrency(2100000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Services Revenue</span><span className="text-sm font-medium text-slate-900">{formatCurrency(850000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Subscription Revenue</span><span className="text-sm font-medium text-slate-900">{formatCurrency(486000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Other Revenue</span><span className="text-sm font-medium text-slate-900">{formatCurrency(1200)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Total Revenue</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(3437200)}</span>
                </div>
              </div>
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Expenses</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Cost of Goods Sold</span><span className="text-sm font-medium text-slate-900">{formatCurrency(320000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Salaries & Wages</span><span className="text-sm font-medium text-slate-900">{formatCurrency(1280000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Rent & Facilities</span><span className="text-sm font-medium text-slate-900">{formatCurrency(336000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Cloud Infrastructure</span><span className="text-sm font-medium text-slate-900">{formatCurrency(540000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Marketing & Advertising</span><span className="text-sm font-medium text-slate-900">{formatCurrency(390000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Other Expenses</span><span className="text-sm font-medium text-slate-900">{formatCurrency(570000)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Total Expenses</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(2948000)}</span>
                </div>
              </div>
              <div className="flex justify-between py-2 bg-slate-50 rounded-lg px-4">
                <span className="text-base font-bold text-slate-900">Net Income</span>
                <span className="text-base font-bold text-emerald-600">{formatCurrency(489200)}</span>
              </div>
            </div>
          )}

          {activeReport === "balance" && (
            <div className="space-y-4 py-4">
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Assets</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Cash and Equivalents</span><span className="text-sm font-medium text-slate-900">{formatCurrency(4108900)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Accounts Receivable</span><span className="text-sm font-medium text-slate-900">{formatCurrency(167600)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Inventory</span><span className="text-sm font-medium text-slate-900">{formatCurrency(320000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Property & Equipment</span><span className="text-sm font-medium text-slate-900">{formatCurrency(2500000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Software Licenses</span><span className="text-sm font-medium text-slate-900">{formatCurrency(450000)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Total Assets</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(7546500)}</span>
                </div>
              </div>
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Liabilities</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Accounts Payable</span><span className="text-sm font-medium text-slate-900">{formatCurrency(187000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Accrued Expenses</span><span className="text-sm font-medium text-slate-900">{formatCurrency(95000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Long-term Debt</span><span className="text-sm font-medium text-slate-900">{formatCurrency(1500000)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Total Liabilities</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(1782000)}</span>
                </div>
              </div>
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Equity</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Common Stock</span><span className="text-sm font-medium text-slate-900">{formatCurrency(1000000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Retained Earnings</span><span className="text-sm font-medium text-slate-900">{formatCurrency(3855500)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Total Equity</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(4855500)}</span>
                </div>
              </div>
              <div className="flex justify-between py-2 bg-slate-50 rounded-lg px-4">
                <span className="text-base font-bold text-slate-900">Total Liabilities & Equity</span>
                <span className="text-base font-bold text-slate-900">{formatCurrency(6637500)}</span>
              </div>
            </div>
          )}

          {activeReport === "cashflow" && (
            <div className="space-y-4 py-4">
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Operating Activities</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Net Income</span><span className="text-sm font-medium text-slate-900">{formatCurrency(489200)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Depreciation & Amortization</span><span className="text-sm font-medium text-slate-900">{formatCurrency(174000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Changes in Working Capital</span><span className="text-sm font-medium text-slate-900">{formatCurrency(-85000)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Net Operating Cash</span>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(578200)}</span>
                </div>
              </div>
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Investing Activities</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Purchase of Equipment</span><span className="text-sm font-medium text-slate-900">{formatCurrency(-250000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Software Development Costs</span><span className="text-sm font-medium text-slate-900">{formatCurrency(-180000)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Net Investing Cash</span>
                  <span className="text-sm font-bold text-red-600">{formatCurrency(-430000)}</span>
                </div>
              </div>
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-sm font-semibold text-slate-500 uppercase mb-2">Financing Activities</h4>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Debt Repayment</span><span className="text-sm font-medium text-slate-900">{formatCurrency(-75000)}</span></div>
                <div className="flex justify-between py-1"><span className="text-sm text-slate-700">Stock Issuance</span><span className="text-sm font-medium text-slate-900">{formatCurrency(500000)}</span></div>
                <div className="flex justify-between py-2 border-t border-slate-100 mt-2">
                  <span className="text-sm font-semibold text-slate-900">Net Financing Cash</span>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(425000)}</span>
                </div>
              </div>
              <div className="flex justify-between py-2 bg-slate-50 rounded-lg px-4">
                <span className="text-base font-bold text-slate-900">Net Increase in Cash</span>
                <span className="text-base font-bold text-emerald-600">{formatCurrency(573200)}</span>
              </div>
              <div className="flex justify-between py-2 px-4">
                <span className="text-sm text-slate-500">Beginning Cash Balance</span>
                <span className="text-sm font-medium text-slate-900">{formatCurrency(3535700)}</span>
              </div>
              <div className="flex justify-between py-2 px-4">
                <span className="text-sm text-slate-500">Ending Cash Balance</span>
                <span className="text-sm font-bold text-slate-900">{formatCurrency(4108900)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
