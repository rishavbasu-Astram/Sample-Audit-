import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useListVatPayments,
  useCreateVatPayment,
  useDeleteVatPayment,
  getListVatPaymentsQueryKey,
} from "@workspace/api-client-react";
import type { VatPayment } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

export function VatPaymentsPage() {
  const qc = useQueryClient();
  const { data: vatPayments, isLoading } = useListVatPayments();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<VatPayment | null>(null);
  const [period, setPeriod] = useState("");
  const [dueDate, setDueDate] = useState(today());
  const [vatCollected, setVatCollected] = useState("");
  const [vatPaid, setVatPaid] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreateVatPayment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListVatPaymentsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteVatPayment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListVatPaymentsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setPeriod("");
    setDueDate(today());
    setVatCollected("");
    setVatPaid("");
    setNotes("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!period.trim() || !dueDate || vatCollected === "" || vatPaid === "") return;
    createMutation.mutate({
      data: {
        period,
        dueDate,
        vatCollected: parseFloat(vatCollected),
        vatPaid: parseFloat(vatPaid),
        notes: notes || undefined,
      },
    });
  }

  const columns = [
    { header: "Period", accessorKey: "period" as const },
    { header: "Due Date", cell: (item: VatPayment) => formatDate(item.dueDate) },
    { header: "VAT Collected", cell: (item: VatPayment) => formatCurrency(item.vatCollected) },
    { header: "VAT Paid", cell: (item: VatPayment) => formatCurrency(item.vatPaid) },
    {
      header: "Net VAT",
      cell: (item: VatPayment) => <span className="font-medium">{formatCurrency(item.netVat)}</span>,
    },
    { header: "Status", cell: (item: VatPayment) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: VatPayment) => (
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
      title="VAT Payments"
      description="Track your value added tax payments and liabilities."
      actionLabel="Record VAT Payment"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={vatPayments}
        isLoading={isLoading}
        emptyTitle="No VAT payments recorded"
        emptyDescription="Record your first VAT payment."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Record VAT Payment"
        description="Net VAT is calculated as collected minus paid."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Record"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Period *</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Q2 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Due Date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>VAT Collected *</Label>
            <Input type="number" step="0.01" min={0} value={vatCollected} onChange={(e) => setVatCollected(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>VAT Paid *</Label>
            <Input type="number" step="0.01" min={0} value={vatPaid} onChange={(e) => setVatPaid(e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete VAT Payment"
        description={`Delete the VAT payment for "${deleting?.period}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
