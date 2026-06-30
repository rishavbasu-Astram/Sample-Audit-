import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useListPaymentLinks } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export function PaymentLinksPage() {
  const { data: paymentLinks, isLoading } = useListPaymentLinks();

  const columns = [
    { header: "Title", accessorKey: "title" as const },
    { 
      header: "Amount", 
      cell: (item: any) => <span className="font-medium">{formatCurrency(item.amount, item.currency)}</span>
    },
    { 
      header: "Expires At", 
      cell: (item: any) => formatDate(item.expiresAt)
    },
    { 
      header: "Status", 
      cell: (item: any) => <StatusBadge status={item.status} />
    }
  ];

  return (
    <PageLayout 
      title="Payment Links" 
      description="Create and manage shareable payment links."
      actionLabel="Create Payment Link"
      onAction={() => console.log("Create Payment Link")}
    >
      <DataTable 
        columns={columns} 
        data={paymentLinks} 
        isLoading={isLoading} 
        emptyTitle="No payment links"
        emptyDescription="Create a payment link to get paid quickly."
      />
    </PageLayout>
  );
}
