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
  useListRecurringExpenses,
  useCreateRecurringExpense,
  useDeleteRecurringExpense,
  useListVendors,
  getListRecurringExpensesQueryKey,
} from "@workspace/api-client-react";
import type { RecurringExpense } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"];
const CATEGORIES = [
  "Cloud Infrastructure",
  "Office Supplies",
  "Marketing",
  "Rent",
  "Legal & Professional",
  "Utilities",
  "Software",
  "Other",
];
const NO_VENDOR = "none";
const today = () => new Date().toISOString().slice(0, 10);

export function RecurringExpensesPage() {
  const qc = useQueryClient();
  const { data: recurringExpenses, isLoading } = useListRecurringExpenses();
  const { data: vendors } = useListVendors();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<RecurringExpense | null>(null);
  const [vendorId, setVendorId] = useState(NO_VENDOR);
  const [category, setCategory] = useState("Software");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDate, setNextDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreateRecurringExpense({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRecurringExpensesQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteRecurringExpense({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRecurringExpensesQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setVendorId(NO_VENDOR);
    setCategory("Software");
    setFrequency("monthly");
    setNextDate(today());
    setAmount("");
    setNotes("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!category || !amount) return;
    createMutation.mutate({
      data: {
        vendorId: vendorId !== NO_VENDOR ? parseInt(vendorId, 10) : undefined,
        category,
        amount: parseFloat(amount),
        frequency,
        nextDate,
        notes: notes || undefined,
      },
    });
  }

  const columns = [
    { header: "Vendor", cell: (item: RecurringExpense) => item.vendorName || <span className="text-muted-foreground">—</span> },
    { header: "Category", accessorKey: "category" as const },
    { header: "Frequency", cell: (item: RecurringExpense) => <span className="capitalize">{item.frequency}</span> },
    { header: "Next Date", cell: (item: RecurringExpense) => formatDate(item.nextDate) },
    { header: "Amount", cell: (item: RecurringExpense) => <span className="font-medium">{formatCurrency(item.amount)}</span> },
    { header: "Status", cell: (item: RecurringExpense) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: RecurringExpense) => (
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
      title="Recurring Expenses"
      description="Manage subscriptions and recurring out-of-pocket expenses."
      actionLabel="Create Recurring Expense"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={recurringExpenses}
        isLoading={isLoading}
        emptyTitle="No recurring expenses"
        emptyDescription="Set up your first recurring expense."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Recurring Expense"
        description="Schedule a recurring expense or subscription."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="No vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VENDOR}>No vendor</SelectItem>
                {(vendors ?? []).map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
        title="Delete Recurring Expense"
        description={`Stop the recurring "${deleting?.category}" expense? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
