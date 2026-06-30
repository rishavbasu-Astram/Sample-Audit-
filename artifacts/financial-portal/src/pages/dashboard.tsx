import { useGetDashboardSummary, useGetRecentActivity, useGetCashFlow, useGetArAging, useGetApAging } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Activity, Wallet, Receipt, DollarSign } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

export function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: cashFlow, isLoading: isLoadingCashFlow } = useGetCashFlow();
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity();
  const { data: arAging, isLoading: isLoadingArAging } = useGetArAging();
  const { data: apAging, isLoading: isLoadingApAging } = useGetApAging();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="Cash Balance" 
          value={summary?.cashBalance} 
          isLoading={isLoadingSummary} 
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />} 
        />
        <MetricCard 
          title="Total Receivable" 
          value={summary?.totalReceivable} 
          isLoading={isLoadingSummary} 
          icon={<ArrowDownRight className="h-4 w-4 text-green-500" />} 
        />
        <MetricCard 
          title="Total Payable" 
          value={summary?.totalPayable} 
          isLoading={isLoadingSummary} 
          icon={<ArrowUpRight className="h-4 w-4 text-red-500" />} 
        />
        <MetricCard 
          title="Net Profit" 
          value={summary?.netProfit} 
          isLoading={isLoadingSummary} 
          icon={<Activity className="h-4 w-4 text-primary" />} 
        />
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Cash Flow</CardTitle>
            <CardDescription>Income vs Expenses over time</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {isLoadingCashFlow ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="period" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `$${value}`}
                    />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="income" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorIncome)" />
                    <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorExpense)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest transactions and updates</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[200px]" />
                      <Skeleton className="h-3 w-[150px]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {recentActivity?.map((activity) => (
                  <div key={activity.id} className="flex items-center">
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center mr-4">
                      {activity.type === 'invoice' ? <Receipt className="h-4 w-4" /> : 
                       activity.type === 'payment' ? <DollarSign className="h-4 w-4" /> :
                       <Activity className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(activity.date)} • {activity.reference}</p>
                    </div>
                    {activity.amount && (
                      <div className="font-medium text-sm">
                        {formatCurrency(activity.amount)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>A/R Aging</CardTitle>
            <CardDescription>Unpaid customer invoices</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingArAging ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-4">
                <AgingRow label="Current" value={arAging?.current || 0} color="bg-green-500" total={arAging?.total || 1} />
                <AgingRow label="1-30 Days" value={arAging?.days1to30 || 0} color="bg-yellow-500" total={arAging?.total || 1} />
                <AgingRow label="31-60 Days" value={arAging?.days31to60 || 0} color="bg-orange-500" total={arAging?.total || 1} />
                <AgingRow label="61-90 Days" value={arAging?.days61to90 || 0} color="bg-red-400" total={arAging?.total || 1} />
                <AgingRow label="> 90 Days" value={arAging?.over90 || 0} color="bg-red-600" total={arAging?.total || 1} />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>A/P Aging</CardTitle>
            <CardDescription>Unpaid vendor bills</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingApAging ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-4">
                <AgingRow label="Current" value={apAging?.current || 0} color="bg-green-500" total={apAging?.total || 1} />
                <AgingRow label="1-30 Days" value={apAging?.days1to30 || 0} color="bg-yellow-500" total={apAging?.total || 1} />
                <AgingRow label="31-60 Days" value={apAging?.days31to60 || 0} color="bg-orange-500" total={apAging?.total || 1} />
                <AgingRow label="61-90 Days" value={apAging?.days61to90 || 0} color="bg-red-400" total={apAging?.total || 1} />
                <AgingRow label="> 90 Days" value={apAging?.over90 || 0} color="bg-red-600" total={apAging?.total || 1} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, isLoading }: { title: string, value?: number, icon: React.ReactNode, isLoading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-2xl font-bold">{formatCurrency(value || 0)}</div>
        )}
      </CardContent>
    </Card>
  );
}

function AgingRow({ label, value, color, total }: { label: string, value: number, color: string, total: number }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="w-24 text-muted-foreground">{label}</div>
      <div className="flex-1 mx-4 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(percentage, 2)}%` }} />
      </div>
      <div className="w-24 text-right font-medium">{formatCurrency(value)}</div>
    </div>
  );
}
