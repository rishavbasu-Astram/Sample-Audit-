import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useListRecurringInvoices } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RecurringInvoicesPage() {
  const { data: recurringInvoices, isLoading } = useListRecurringInvoices();

  const columns = [
    { header: "Customer", accessorKey: "customerName" as const },
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
      title="Recurring Invoices" 
      description="Automate your regular billing."
      actionLabel="Create Recurring Invoice"
      onAction={() => console.log("Create Recurring Invoice")}
    >
      <DataTable 
        columns={columns} 
        data={recurringInvoices} 
        isLoading={isLoading} 
        emptyTitle="No recurring invoices"
        emptyDescription="Set up your first recurring invoice."
      />
    </PageLayout>
  );
}
