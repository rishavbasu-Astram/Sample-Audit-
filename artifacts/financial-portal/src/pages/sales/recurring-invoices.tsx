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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListRecurringInvoices,
  useCreateRecurringInvoice,
  useDeleteRecurringInvoice,
  useListCustomers,
  getListRecurringInvoicesQueryKey,
} from "@workspace/api-client-react";
import type { RecurringInvoice } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"];
const today = () => new Date().toISOString().slice(0, 10);

export function RecurringInvoicesPage() {
  const qc = useQueryClient();
  const { data: recurringInvoices, isLoading } = useListRecurringInvoices();
  const { data: customers } = useListCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<RecurringInvoice | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDate, setNextDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreateRecurringInvoice({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRecurringInvoicesQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteRecurringInvoice({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRecurringInvoicesQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setCustomerId("");
    setFrequency("monthly");
    setNextDate(today());
    setAmount("");
    setNotes("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!customerId || !amount) return;
    createMutation.mutate({
      data: {
        customerId: parseInt(customerId, 10),
        frequency,
        nextDate,
        amount: parseFloat(amount),
        notes: notes || undefined,
      },
    });
  }

  const columns = [
    { header: "Customer", accessorKey: "customerName" as const },
    { header: "Frequency", cell: (item: RecurringInvoice) => <span className="capitalize">{item.frequency}</span> },
    { header: "Next Date", cell: (item: RecurringInvoice) => formatDate(item.nextDate) },
    { header: "Amount", cell: (item: RecurringInvoice) => <span className="font-medium">{formatCurrency(item.amount)}</span> },
    { header: "Status", cell: (item: RecurringInvoice) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: RecurringInvoice) => (
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
      title="Recurring Invoices"
      description="Automate your regular billing."
      actionLabel="Create Recurring Invoice"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={recurringInvoices}
        isLoading={isLoading}
        emptyTitle="No recurring invoices"
        emptyDescription="Set up your first recurring invoice."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Recurring Invoice"
        description="Bill a customer automatically on a schedule."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Frequency *</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Next Date *</Label>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
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
        title="Delete Recurring Invoice"
        description={`Stop the recurring invoice for "${deleting?.customerName}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
