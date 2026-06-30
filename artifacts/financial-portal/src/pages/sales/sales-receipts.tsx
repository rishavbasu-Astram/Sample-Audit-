import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { useListSalesReceipts } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export function SalesReceiptsPage() {
  const { data: salesReceipts, isLoading } = useListSalesReceipts();

  const columns = [
    { header: "Receipt #", accessorKey: "receiptNumber" as const },
    { header: "Customer", accessorKey: "customerName" as const },
    { 
      header: "Date", 
      cell: (item: any) => formatDate(item.date)
    },
    { header: "Payment Method", accessorKey: "paymentMethod" as const },
    { 
      header: "Amount", 
      cell: (item: any) => <span className="font-medium">{formatCurrency(item.amount)}</span>
    }
  ];

  return (
    <PageLayout 
      title="Sales Receipts" 
      description="Record direct sales and immediate payments."
      actionLabel="Create Sales Receipt"
      onAction={() => console.log("Create Sales Receipt")}
    >
      <DataTable 
        columns={columns} 
        data={salesReceipts} 
        isLoading={isLoading} 
        emptyTitle="No sales receipts"
        emptyDescription="Record your first sales receipt."
      />
    </PageLayout>
  );
}
