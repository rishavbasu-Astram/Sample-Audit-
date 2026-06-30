import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetProfitabilityReport } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

export function ProfitabilityPage() {
  const { data: report, isLoading } = useGetProfitabilityReport();
  const summary = report?.summary;
  const grossProfit = summary?.grossProfit ?? 0;

  return (
    <PageLayout
      title="Profitability Analysis"
      description="Contribution margin by period and customer. Accrual basis, excluding tax (invoiced revenue vs. billed and expensed cost) — this differs from the dashboard's cash-basis net profit."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Revenue"
          value={formatCurrency(summary?.revenue ?? 0)}
          isLoading={isLoading}
          icon={<DollarSign className="h-4 w-4 text-green-500" />}
        />
        <Stat
          title="Cost"
          value={formatCurrency(summary?.cost ?? 0)}
          isLoading={isLoading}
          icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        />
        <Stat
          title="Gross Profit"
          value={formatCurrency(grossProfit)}
          isLoading={isLoading}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          valueClass={grossProfit < 0 ? "text-destructive" : undefined}
        />
        <Stat
          title="Gross Margin"
          value={`${(summary?.margin ?? 0).toFixed(1)}%`}
          isLoading={isLoading}
          icon={<Percent className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue vs. Cost</CardTitle>
          <CardDescription>Trailing six months (ex-tax)</CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          {isLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report?.byMonth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`}
                  />
                  <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="Cost" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profit by Month</CardTitle>
            <CardDescription>Gross profit and margin per period</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium py-2">Period</th>
                    <th className="text-right font-medium py-2">Revenue</th>
                    <th className="text-right font-medium py-2">Cost</th>
                    <th className="text-right font-medium py-2">Gross Profit</th>
                    <th className="text-right font-medium py-2">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.byMonth.map((m) => (
                    <tr key={m.period} className="border-b last:border-0">
                      <td className="py-2">{m.period}</td>
                      <td className="py-2 text-right">{formatCurrency(m.revenue)}</td>
                      <td className="py-2 text-right">{formatCurrency(m.cost)}</td>
                      <td className={`py-2 text-right font-medium ${m.grossProfit < 0 ? "text-destructive" : "text-green-600"}`}>
                        {formatCurrency(m.grossProfit)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{m.margin.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Customer</CardTitle>
            <CardDescription>Top contributing customers (ex-tax)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium py-2">Customer</th>
                    <th className="text-right font-medium py-2">Revenue</th>
                    <th className="text-right font-medium py-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.byCustomer.map((c) => {
                    const total = summary?.revenue ?? 0;
                    const share = total > 0 ? (c.revenue / total) * 100 : 0;
                    return (
                      <tr key={c.customerId} className="border-b last:border-0">
                        <td className="py-2">{c.customerName}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(c.revenue)}</td>
                        <td className="py-2 text-right text-muted-foreground">{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

function Stat({
  title,
  value,
  icon,
  isLoading,
  valueClass,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  isLoading: boolean;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-7 w-24" /> : <div className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</div>}
      </CardContent>
    </Card>
  );
}
