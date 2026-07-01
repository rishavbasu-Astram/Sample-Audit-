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
  useListRecurringBills,
  useCreateRecurringBill,
  useDeleteRecurringBill,
  useListVendors,
  getListRecurringBillsQueryKey,
} from "@workspace/api-client-react";
import type { RecurringBill } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"];
const today = () => new Date().toISOString().slice(0, 10);

export function RecurringBillsPage() {
  const qc = useQueryClient();
  const { data: recurringBills, isLoading } = useListRecurringBills();
  const { data: vendors } = useListVendors();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<RecurringBill | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDate, setNextDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreateRecurringBill({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRecurringBillsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteRecurringBill({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRecurringBillsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setVendorId("");
    setFrequency("monthly");
    setNextDate(today());
    setAmount("");
    setNotes("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!vendorId || !amount) return;
    createMutation.mutate({
      data: {
        vendorId: parseInt(vendorId, 10),
        frequency,
        nextDate,
        amount: parseFloat(amount),
        notes: notes || undefined,
      },
    });
  }

  const columns = [
    { header: "Vendor", accessorKey: "vendorName" as const },
    { header: "Frequency", cell: (item: RecurringBill) => <span className="capitalize">{item.frequency}</span> },
    { header: "Next Date", cell: (item: RecurringBill) => formatDate(item.nextDate) },
    { header: "Amount", cell: (item: RecurringBill) => <span className="font-medium">{formatCurrency(item.amount)}</span> },
    { header: "Status", cell: (item: RecurringBill) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: RecurringBill) => (
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
      title="Recurring Bills"
      description="Manage automated vendor bills."
      actionLabel="Create Recurring Bill"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={recurringBills}
        isLoading={isLoading}
        emptyTitle="No recurring bills"
        emptyDescription="Set up your first recurring bill."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Recurring Bill"
        description="Schedule a recurring bill from a vendor."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
              <SelectContent>
                {(vendors ?? []).map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
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
        title="Delete Recurring Bill"
        description={`Stop the recurring bill for "${deleting?.vendorName}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
