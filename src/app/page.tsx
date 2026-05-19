"use client";

import { KPICard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  mockCashAccounts,
  mockTransactions,
  mockInvoices,
  formatCurrency,
  formatDate,
  getStatusColor,
} from "@/data/mockData";
import {
  Wallet,
  TrendingUp,
  Clock,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  ChevronRight
} from "lucide-react";

// Chart component using Recharts
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const cashFlowData = [
  { month: "Jan", inflow: 3200000, outflow: 2800000 },
  { month: "Feb", inflow: 3400000, outflow: 2900000 },
  { month: "Mar", inflow: 3100000, outflow: 2700000 },
  { month: "Apr", inflow: 3800000, outflow: 3100000 },
  { month: "May", inflow: 4108900, outflow: 2950000 },
  { month: "Jun", inflow: 3950000, outflow: 3050000 },
];

const expenseData = [
  { name: "Salaries", value: 1280000, color: "#3b82f6" },
  { name: "Cloud", value: 540000, color: "#10b981" },
  { name: "Rent", value: 336000, color: "#f59e0b" },
  { name: "Marketing", value: 390000, color: "#ef4444" },
  { name: "Software", value: 288000, color: "#8b5cf6" },
  { name: "Other", value: 102000, color: "#6b7280" },
];

export default function DashboardPage() {
  const totalCash = mockCashAccounts.reduce((sum, acc) => {
    const rate = acc.currency === "EUR" ? 1.08 : 1;
    return sum + acc.balance * rate;
  }, 0);

  const totalAR = mockInvoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.total, 0);

  const overdueInvoices = mockInvoices.filter((i) => i.status === "overdue");
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Cash Position"
          value={totalCash}
          previousValue={3850000}
          change={258900.5}
          changePercent={6.72}
          trend="up"
          target={4000000}
          unit="currency"
          icon={Wallet}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-50"
        />
        <KPICard
          title="Monthly Recurring Revenue"
          value={486000}
          previousValue={450000}
          change={36000}
          changePercent={8.0}
          trend="up"
          target={500000}
          unit="currency"
          icon={TrendingUp}
          iconColor="text-emerald-600"
          iconBgColor="bg-emerald-50"
        />
        <KPICard
          title="Accounts Receivable"
          value={totalAR}
          previousValue={150000}
          change={0}
          changePercent={2.5}
          trend="up"
          unit="currency"
          icon={Clock}
          iconColor="text-amber-600"
          iconBgColor="bg-amber-50"
        />
        <KPICard
          title="Overdue Invoices"
          value={overdueAmount}
          previousValue={0}
          change={0}
          changePercent={0}
          trend="down"
          unit="currency"
          icon={AlertTriangle}
          iconColor="text-red-600"
          iconBgColor="bg-red-50"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cash Flow Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={cashFlowData}>
                <defs>
                  <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
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
                <Area
                  type="monotone"
                  dataKey="inflow"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorInflow)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="outflow"
                  stroke="#ef4444"
                  fillOpacity={1}
                  fill="url(#colorOutflow)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={expenseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {expenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {expenseData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-slate-600">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <a href="/cashflow" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </a>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockTransactions.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      t.amount > 0 ? "bg-emerald-50" : "bg-red-50"
                    }`}
                  >
                    {t.amount > 0 ? (
                      <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t.description}</p>
                    <p className="text-xs text-slate-500">
                      {t.accountId} • {formatDate(t.date)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      t.amount > 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {t.amount > 0 ? "+" : ""}
                    {formatCurrency(t.amount)}
                  </p>
                  <Badge variant="outline" className={getStatusColor(t.status)}>
                    {t.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pending Invoices</CardTitle>
            <a href="/invoicing" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </a>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockInvoices
              .filter((i) => i.status !== "paid")
              .map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{inv.clientName}</p>
                      <p className="text-xs text-slate-500">
                        {inv.invoiceNumber} • Due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(inv.total, inv.currency)}
                    </p>
                    <Badge variant="outline" className={getStatusColor(inv.status)}>
                      {inv.status}
                    </Badge>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
