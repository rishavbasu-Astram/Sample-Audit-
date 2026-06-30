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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useListVendors,
  getListExpensesQueryKey,
} from "@workspace/api-client-react";
import type { Expense, ExpenseInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";

const CATEGORIES = [
  "Advertising", "Bank Fees", "Dues & Subscriptions", "Entertainment",
  "Equipment", "Insurance", "Legal & Professional", "Meals",
  "Office Supplies", "Rent", "Repairs & Maintenance", "Software",
  "Travel", "Utilities", "Other",
];

const PAYMENT_METHODS = ["Cash", "Credit Card", "Bank Transfer", "Check", "Other"];

const EMPTY: ExpenseInput = {
  vendorId: undefined,
  date: new Date().toISOString().slice(0, 10),
  category: "Other",
  amount: 0,
  taxAmount: 0,
  paymentMethod: "Bank Transfer",
  reference: "",
  notes: "",
};

export function ExpensesPage() {
  const qc = useQueryClient();
  const { data: expenses, isLoading } = useListExpenses();
  const { data: vendors } = useListVendors();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseInput>(EMPTY);
  const [vendorId, setVendorId] = useState("none");

  const createMutation = useCreateExpense({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListExpensesQueryKey() }); setFormOpen(false); } },
  });
  const updateMutation = useUpdateExpense({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListExpensesQueryKey() }); setFormOpen(false); } },
  });
  const deleteMutation = useDeleteExpense({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListExpensesQueryKey() }); setDeleteOpen(false); } },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setVendorId("none");
    setFormOpen(true);
  }

  function openEdit(e: Expense) {
    setEditing(e);
    setForm({
      vendorId: e.vendorId ?? undefined,
      date: e.date,
      category: e.category,
      amount: e.amount,
      taxAmount: e.taxAmount,
      paymentMethod: e.paymentMethod,
      reference: e.reference ?? "",
      notes: e.notes ?? "",
    });
    setVendorId(e.vendorId ? String(e.vendorId) : "none");
    setFormOpen(true);
  }

  function openDelete(e: Expense) {
    setDeleting(e);
    setDeleteOpen(true);
  }

  function set(field: keyof ExpenseInput, value: string | number | undefined) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.category || !form.date) return;
    const payload: ExpenseInput = {
      ...form,
      vendorId: vendorId !== "none" ? parseInt(vendorId, 10) : undefined,
      amount: Number(form.amount),
      taxAmount: Number(form.taxAmount),
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: { category: payload.category, amount: payload.amount, taxAmount: payload.taxAmount, notes: payload.notes } });
    } else {
      createMutation.mutate({ data: payload });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const columns = [
    { header: "Date", cell: (item: Expense) => formatDate(item.date) },
    { header: "Vendor", cell: (item: Expense) => item.vendorName || <span className="text-muted-foreground">—</span> },
    { header: "Category", accessorKey: "category" as const },
    { header: "Payment Method", accessorKey: "paymentMethod" as const },
    { header: "Reference", cell: (item: Expense) => item.reference || <span className="text-muted-foreground">—</span> },
    { header: "Total", cell: (item: Expense) => <span className="font-medium">{formatCurrency(item.total)}</span> },
    {
      header: "",
      cell: (item: Expense) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => openDelete(item)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageLayout
      title="Expenses"
      description="Track out-of-pocket and direct expenses."
      actionLabel="Record Expense"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={expenses}
        isLoading={isLoading}
        emptyTitle="No expenses recorded"
        emptyDescription="Record your first business expense."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Edit Expense" : "Record Expense"}
        description={editing ? "Update expense details." : "Record a new business expense."}
        onSubmit={handleSubmit}
        isSubmitting={isSaving}
        submitLabel={editing ? "Update" : "Record"}
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} disabled={!!editing} />
          </div>
          <div className="space-y-1.5">
            <Label>Vendor (optional)</Label>
            <Select value={vendorId} onValueChange={setVendorId} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="No vendor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vendor</SelectItem>
                {(vendors ?? []).map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method *</Label>
            <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)} disabled={!!editing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tax Amount</Label>
            <Input type="number" min={0} step="0.01" value={form.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input value={form.reference ?? ""} onChange={(e) => set("reference", e.target.value)} placeholder="Receipt / ref number" disabled={!!editing} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Expense"
        description={`Are you sure you want to delete this expense? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
