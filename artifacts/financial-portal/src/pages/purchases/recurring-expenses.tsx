import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useListRecurringExpenses } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RecurringExpensesPage() {
  const { data: recurringExpenses, isLoading } = useListRecurringExpenses();

  const columns = [
    { header: "Vendor", accessorKey: "vendorName" as const, cell: (item: any) => item.vendorName || '-' },
    { header: "Category", accessorKey: "category" as const },
    { header: "Frequency", accessorKey: "frequency" as const, cell: (item: any) => <span className="capitalize">{item.frequency}</span> },
    { 
      header: "Next Date", 
      cell: (item: any) => formatDate(item.nextDate)
    },
    { 
      header: "Amount", 
      cell: (item: any) => <span className="font-medium">{formatCurrency(item.amount)}</span>
    },
    { 
      header: "Status", 
      cell: (item: any) => <StatusBadge status={item.status} />
    }
  ];

  return (
    <PageLayout 
      title="Recurring Expenses" 
      description="Manage subscriptions and recurring out-of-pocket expenses."
      actionLabel="Create Recurring Expense"
      onAction={() => console.log("Create Recurring Expense")}
    >
      <DataTable 
        columns={columns} 
        data={recurringExpenses} 
        isLoading={isLoading} 
        emptyTitle="No recurring expenses"
        emptyDescription="Set up your first recurring expense."
      />
    </PageLayout>
  );
}
