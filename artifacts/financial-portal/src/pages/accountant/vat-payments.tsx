import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useListVatPayments } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export function VatPaymentsPage() {
  const { data: vatPayments, isLoading } = useListVatPayments();

  const columns = [
    { header: "Period", accessorKey: "period" as const },
    { 
      header: "Due Date", 
      cell: (item: any) => formatDate(item.dueDate)
    },
    { 
      header: "Net VAT", 
      cell: (item: any) => <span className="font-medium">{formatCurrency(item.netVat)}</span>
    },
    { 
      header: "Paid Date", 
      cell: (item: any) => formatDate(item.paidDate)
    },
    { 
      header: "Status", 
      cell: (item: any) => <StatusBadge status={item.status} />
    }
  ];

  return (
    <PageLayout 
      title="VAT Payments" 
      description="Track your value added tax payments and liabilities."
      actionLabel="Record VAT Payment"
      onAction={() => console.log("Record VAT Payment")}
    >
      <DataTable 
        columns={columns} 
        data={vatPayments} 
        isLoading={isLoading} 
        emptyTitle="No VAT payments recorded"
        emptyDescription="Record your first VAT payment."
      />
    </PageLayout>
  );
}
