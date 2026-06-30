import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { useListCurrencyAdjustments } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export function CurrencyAdjustmentsPage() {
  const { data: adjustments, isLoading } = useListCurrencyAdjustments();

  const columns = [
    { 
      header: "Date", 
      cell: (item: any) => formatDate(item.date)
    },
    { header: "From Currency", accessorKey: "fromCurrency" as const },
    { header: "To Currency", accessorKey: "toCurrency" as const },
    { header: "Exchange Rate", accessorKey: "exchangeRate" as const },
    { 
      header: "Adjustment", 
      cell: (item: any) => <span className="font-medium">{formatCurrency(item.adjustmentAmount, item.toCurrency)}</span>
    }
  ];

  return (
    <PageLayout 
      title="Currency Adjustments" 
      description="Manage exchange rate adjustments and unrealized gains/losses."
      actionLabel="Create Adjustment"
      onAction={() => console.log("Create Adjustment")}
    >
      <DataTable 
        columns={columns} 
        data={adjustments} 
        isLoading={isLoading} 
        emptyTitle="No currency adjustments"
        emptyDescription="Create manual exchange rate adjustments."
      />
    </PageLayout>
  );
}
