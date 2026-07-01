import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useListTransactionLocks,
  useCreateTransactionLock,
  useDeleteTransactionLock,
  getListTransactionLocksQueryKey,
} from "@workspace/api-client-react";
import type { TransactionLock } from "@workspace/api-client-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

export function TransactionLockingPage() {
  const qc = useQueryClient();
  const { data: locks, isLoading } = useListTransactionLocks();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<TransactionLock | null>(null);
  const [lockDate, setLockDate] = useState(today());
  const [description, setDescription] = useState("");

  const createMutation = useCreateTransactionLock({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTransactionLocksQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteTransactionLock({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListTransactionLocksQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setLockDate(today());
    setDescription("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!lockDate) return;
    createMutation.mutate({ data: { lockDate, description: description || undefined } });
  }

  const columns = [
    {
      header: "Locked Through Date",
      cell: (item: TransactionLock) => <span className="font-medium">{formatDate(item.lockDate)}</span>,
    },
    {
      header: "Description",
      cell: (item: TransactionLock) => item.description || <span className="text-muted-foreground">—</span>,
    },
    { header: "Created At", cell: (item: TransactionLock) => formatDateTime(item.createdAt) },
    {
      header: "",
      cell: (item: TransactionLock) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => { setDeleting(item); setDeleteOpen(true); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <PageLayout
      title="Transaction Locking"
      description="Lock transactions prior to a specific date to prevent historical changes."
      actionLabel="Add Lock"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={locks}
        isLoading={isLoading}
        emptyTitle="No transaction locks"
        emptyDescription="Add a lock date to prevent edits to historical transactions."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Add Transaction Lock"
        description="Prevent edits to transactions dated on or before the lock date."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Add Lock"
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Lock Through Date *</Label>
            <Input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. FY2025 close" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove Lock"
        description={`Remove the transaction lock dated ${deleting ? formatDate(deleting.lockDate) : ""}? Historical transactions will become editable again.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
