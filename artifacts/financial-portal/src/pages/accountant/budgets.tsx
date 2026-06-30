import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useListBudgets } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

export function BudgetsPage() {
  const { data: budgets, isLoading } = useListBudgets();

  const columns = [
    { header: "Name", accessorKey: "name" as const },
    { header: "Fiscal Year", accessorKey: "fiscalYear" as const },
    { header: "Period", accessorKey: "period" as const, cell: (item: any) => <span className="capitalize">{item.period}</span> },
    { 
      header: "Total Budgeted", 
      cell: (item: any) => <span className="font-medium">{formatCurrency(item.totalBudgeted)}</span>
    },
    { 
      header: "Total Actual", 
      cell: (item: any) => <span className="font-medium">{formatCurrency(item.totalActual)}</span>
    },
    { 
      header: "Status", 
      cell: (item: any) => <StatusBadge status={item.status} />
    }
  ];

  return (
    <PageLayout 
      title="Budgets" 
      description="Plan and track your financial budgets."
      actionLabel="Create Budget"
      onAction={() => console.log("Create Budget")}
    >
      <DataTable 
        columns={columns} 
        data={budgets} 
        isLoading={isLoading} 
        emptyTitle="No budgets created"
        emptyDescription="Create your first budget to start tracking performance."
      />
    </PageLayout>
  );
}
