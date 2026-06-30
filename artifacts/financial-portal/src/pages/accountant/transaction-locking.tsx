import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { useListTransactionLocks } from "@workspace/api-client-react";
import { formatDate, formatDateTime } from "@/lib/utils";

export function TransactionLockingPage() {
  const { data: locks, isLoading } = useListTransactionLocks();

  const columns = [
    { 
      header: "Locked Through Date", 
      cell: (item: any) => <span className="font-medium">{formatDate(item.lockDate)}</span>
    },
    { header: "Description", accessorKey: "description" as const },
    { 
      header: "Created At", 
      cell: (item: any) => formatDateTime(item.createdAt)
    }
  ];

  return (
    <PageLayout 
      title="Transaction Locking" 
      description="Lock transactions prior to a specific date to prevent historical changes."
      actionLabel="Add Lock"
      onAction={() => console.log("Add Lock")}
    >
      <DataTable 
        columns={columns} 
        data={locks} 
        isLoading={isLoading} 
        emptyTitle="No transaction locks"
        emptyDescription="Add a lock date to prevent edits to historical transactions."
      />
    </PageLayout>
  );
}
