import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useListRecurringBills } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RecurringBillsPage() {
  const { data: recurringBills, isLoading } = useListRecurringBills();

  const columns = [
    { header: "Vendor", accessorKey: "vendorName" as const },
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
      title="Recurring Bills" 
      description="Manage automated vendor bills."
      actionLabel="Create Recurring Bill"
      onAction={() => console.log("Create Recurring Bill")}
    >
      <DataTable 
        columns={columns} 
        data={recurringBills} 
        isLoading={isLoading} 
        emptyTitle="No recurring bills"
        emptyDescription="Set up your first recurring bill."
      />
    </PageLayout>
  );
}
