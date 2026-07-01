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
  useListSalesReceipts,
  useCreateSalesReceipt,
  useDeleteSalesReceipt,
  useListCustomers,
  getListSalesReceiptsQueryKey,
} from "@workspace/api-client-react";
import type { SalesReceipt } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const PAYMENT_METHODS = ["Cash", "Credit Card", "Bank Transfer", "Check", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

export function SalesReceiptsPage() {
  const qc = useQueryClient();
  const { data: salesReceipts, isLoading } = useListSalesReceipts();
  const { data: customers } = useListCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<SalesReceipt | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useCreateSalesReceipt({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSalesReceiptsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteSalesReceipt({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSalesReceiptsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setCustomerId("");
    setDate(today());
    setPaymentMethod("Bank Transfer");
    setAmount("");
    setDescription("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!customerId || !amount) return;
    const value = parseFloat(amount);
    createMutation.mutate({
      data: {
        customerId: parseInt(customerId, 10),
        date,
        paymentMethod,
        lineItems: [
          { description: description || "Sale", quantity: 1, unitPrice: value, amount: value },
        ],
      },
    });
  }

  const columns = [
    { header: "Receipt #", accessorKey: "receiptNumber" as const },
    { header: "Customer", accessorKey: "customerName" as const },
    { header: "Date", cell: (item: SalesReceipt) => formatDate(item.date) },
    { header: "Payment Method", accessorKey: "paymentMethod" as const },
    {
      header: "Amount",
      cell: (item: SalesReceipt) => <span className="font-medium text-green-600">{formatCurrency(item.amount)}</span>,
    },
    {
      header: "",
      cell: (item: SalesReceipt) => (
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
      title="Sales Receipts"
      description="Record direct sales and immediate payments."
      actionLabel="Create Sales Receipt"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={salesReceipts}
        isLoading={isLoading}
        emptyTitle="No sales receipts"
        emptyDescription="Record your first sales receipt."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Sales Receipt"
        description="Record a sale that has already been paid."
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
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was sold" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Sales Receipt"
        description={`Delete sales receipt "${deleting?.receiptNumber}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
