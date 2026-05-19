"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  mockCashAccounts,
  mockTransactions,
  formatCurrency,
  formatDate,
  getStatusColor,
} from "@/data/mockData";
import {
  CreditCard,
  PiggyBank,
  TrendingUp,
  Landmark,
  Filter,
  Download
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const forecastData = [
  { date: "May 15", net: 230000 },
  { date: "May 30", net: 220000 },
  { date: "Jun 15", net: 140000 },
  { date: "Jun 30", net: 250000 },
  { date: "Jul 15", net: 190000 },
  { date: "Jul 31", net: 230000 },
];

const accountIcons: Record<string, React.ElementType> = {
  checking: CreditCard,
  savings: PiggyBank,
  investment: TrendingUp,
  credit: Landmark,
};

const accountColors: Record<string, { bg: string; text: string }> = {
  checking: { bg: "bg-blue-50", text: "text-blue-600" },
  savings: { bg: "bg-emerald-50", text: "text-emerald-600" },
  investment: { bg: "bg-purple-50", text: "text-purple-600" },
  credit: { bg: "bg-orange-50", text: "text-orange-600" },
};

export default function CashFlowPage() {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const filteredTransactions = selectedAccount
    ? mockTransactions.filter((t) => t.accountId === selectedAccount)
    : mockTransactions;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockCashAccounts.map((acc) => {
          const Icon = accountIcons[acc.type] || CreditCard;
          const colors = accountColors[acc.type] || accountColors.checking;
          return (
            <Card
              key={acc.id}
              className={`cursor-pointer transition-all duration-200 ${
                selectedAccount === acc.id
                  ? "ring-2 ring-blue-500 shadow-lg"
                  : "hover:shadow-md"
              }`}
              onClick={() =>
                setSelectedAccount(selectedAccount === acc.id ? null : acc.id)
              }
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {acc.currency}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500">{acc.name}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {formatCurrency(acc.balance, acc.currency)}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  {acc.bankName} • {acc.accountNumber}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Transactions</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              {selectedAccount
                ? `Showing transactions for selected account`
                : "Showing all accounts"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                    Account
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {t.description}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {t.accountId}
                    </td>
                    <td
                      className={`px-6 py-4 text-sm font-semibold text-right ${
                        t.amount > 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {t.amount > 0 ? "+" : ""}
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge
                        variant="outline"
                        className={getStatusColor(t.status)}
                      >
                        {t.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cash Flow Forecast */}
      <Card>
        <CardHeader>
          <CardTitle>90-Day Cash Flow Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="net" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
