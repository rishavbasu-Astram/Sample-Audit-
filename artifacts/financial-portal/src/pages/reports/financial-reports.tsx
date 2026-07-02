import { useState } from "react";
import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetProfitAndLoss,
  getGetProfitAndLossQueryKey,
  useGetTrialBalance,
  getGetTrialBalanceQueryKey,
  type PnlCustomerRow,
  type PnlCategoryRow,
  type TrialBalanceRow,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, Download } from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function defaultFromStr() {
  return `${new Date().getFullYear()}-01-01`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  valueClass,
  isLoading,
}: {
  title: string;
  value: string;
  valueClass?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <div className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Profit & Loss Tab ──────────────────────────────────────────────────────

function ProfitAndLossTab() {
  const [fromDate, setFromDate] = useState(defaultFromStr);
  const [toDate, setToDate] = useState(todayStr);

  // Explicit queryKey ensures React Query refetches when dates change
  const { data, isLoading } = useGetProfitAndLoss(
    { fromDate, toDate },
    { query: { queryKey: getGetProfitAndLossQueryKey({ fromDate, toDate }) } },
  );

  const netProfit = data?.netProfit ?? 0;

  const customerColumns = [
    { header: "Customer", accessorKey: "customerName" as const },
    {
      header: "Amount",
      cell: (row: PnlCustomerRow) => formatCurrency(row.amount),
    },
  ];

  const categoryColumns = [
    { header: "Category", accessorKey: "category" as const },
    {
      header: "Amount",
      cell: (row: PnlCategoryRow) => formatCurrency(row.amount),
    },
  ];

  function exportCustomerCsv() {
    const rows: string[][] = [
      ["Customer", "Amount"],
      ...(data?.revenueByCustomer ?? []).map((r) => [
        r.customerName ?? `Customer ${r.customerId}`,
        String(r.amount),
      ]),
    ];
    downloadCsv("pnl-revenue-by-customer.csv", rows);
  }

  function exportCategoryCsv() {
    const rows: string[][] = [
      ["Category", "Amount"],
      ...(data?.expensesByCategory ?? []).map((r) => [r.category, String(r.amount)]),
    ];
    downloadCsv("pnl-expenses-by-category.csv", rows);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Date range pickers */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">From</span>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">To</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Revenue"
          value={formatCurrency(data?.revenue ?? 0)}
          isLoading={isLoading}
        />
        <KpiCard
          title="Costs"
          value={formatCurrency(data?.costs ?? 0)}
          isLoading={isLoading}
        />
        <KpiCard
          title="Net Profit"
          value={formatCurrency(netProfit)}
          valueClass={netProfit >= 0 ? "text-green-600" : "text-destructive"}
          isLoading={isLoading}
        />
      </div>

      {/* Breakdown tables */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Revenue by Customer</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCustomerCsv} disabled={isLoading}>
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={customerColumns}
              data={data?.revenueByCustomer}
              isLoading={isLoading}
              emptyTitle="No revenue data"
              emptyDescription="No invoices matched the selected date range."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Expenses by Category</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCategoryCsv} disabled={isLoading}>
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={categoryColumns}
              data={data?.expensesByCategory}
              isLoading={isLoading}
              emptyTitle="No expense data"
              emptyDescription="No expenses matched the selected date range."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Trial Balance Tab ──────────────────────────────────────────────────────

function TrialBalanceTab() {
  const { data, isLoading } = useGetTrialBalance({
    query: { queryKey: getGetTrialBalanceQueryKey() },
  });

  const tbColumns = [
    { header: "Code", accessorKey: "code" as const },
    { header: "Account", accessorKey: "name" as const },
    {
      header: "Type",
      cell: (row: TrialBalanceRow) =>
        row.type.charAt(0).toUpperCase() + row.type.slice(1),
    },
    {
      header: "Debit",
      cell: (row: TrialBalanceRow) =>
        row.debit !== 0 ? formatCurrency(row.debit) : "",
    },
    {
      header: "Credit",
      cell: (row: TrialBalanceRow) =>
        row.credit !== 0 ? formatCurrency(row.credit) : "",
    },
  ];

  function exportTrialBalanceCsv() {
    const rows: string[][] = [
      ["Code", "Account", "Type", "Debit", "Credit"],
      ...(data?.rows ?? []).map((r) => [
        r.code,
        r.name,
        r.type,
        r.debit !== 0 ? String(r.debit) : "",
        r.credit !== 0 ? String(r.credit) : "",
      ]),
      ["", "", "Total", String(data?.totalDebit ?? 0), String(data?.totalCredit ?? 0)],
    ];
    downloadCsv("trial-balance.csv", rows);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Trial Balance</CardTitle>
        <Button variant="outline" size="sm" onClick={exportTrialBalanceCsv} disabled={isLoading}>
          <Download className="mr-1 h-4 w-4" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DataTable
          columns={tbColumns}
          data={data?.rows}
          isLoading={isLoading}
          emptyTitle="No accounts"
          emptyDescription="No active accounts found in the chart of accounts."
        />

        {/* Footer totals row — outside DataTable */}
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <div className="flex items-center justify-between rounded-md border bg-muted/50 px-4 py-2 text-sm font-medium">
            <div className="flex gap-8">
              <span>
                Total Debit:{" "}
                <span className="font-bold">{formatCurrency(data?.totalDebit ?? 0)}</span>
              </span>
              <span>
                Total Credit:{" "}
                <span className="font-bold">{formatCurrency(data?.totalCredit ?? 0)}</span>
              </span>
            </div>
            {data && (
              <StatusBadge status={data.balanced ? "balanced" : "unbalanced"} />
            )}
          </div>
        )}

        {data?.asOf && (
          <p className="text-xs text-muted-foreground">As of {data.asOf}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function FinancialReportsPage() {
  return (
    <PageLayout
      title="Financial Reports"
      description="Profit & loss and trial balance, generated live from the ledger."
    >
      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl" className="mt-6">
          <ProfitAndLossTab />
        </TabsContent>

        <TabsContent value="trial-balance" className="mt-6">
          <TrialBalanceTab />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
