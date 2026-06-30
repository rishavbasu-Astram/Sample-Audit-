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
  useListPaymentsReceived,
  useCreatePaymentReceived,
  useDeletePaymentReceived,
  useListCustomers,
  useListInvoices,
  getListPaymentsReceivedQueryKey,
} from "@workspace/api-client-react";
import type { PaymentReceived, PaymentReceivedInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const PAYMENT_METHODS = ["Cash", "Credit Card", "Bank Transfer", "Check", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

export function PaymentsReceivedPage() {
  const qc = useQueryClient();
  const { data: payments, isLoading } = useListPaymentsReceived();
  const { data: customers } = useListCustomers();
  const { data: invoices } = useListInvoices();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<PaymentReceived | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("none");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreatePaymentReceived({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPaymentsReceivedQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeletePaymentReceived({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPaymentsReceivedQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setCustomerId("");
    setInvoiceId("none");
    setDate(today());
    setAmount("");
    setPaymentMethod("Bank Transfer");
    setReference("");
    setNotes("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!customerId || !amount) return;
    const payload: PaymentReceivedInput = {
      customerId: parseInt(customerId, 10),
      date,
      amount: parseFloat(amount),
      paymentMethod,
      reference: reference || undefined,
      invoiceId: invoiceId !== "none" ? parseInt(invoiceId, 10) : undefined,
      notes: notes || undefined,
    };
    createMutation.mutate({ data: payload });
  }

  const filteredInvoices = invoices?.filter(
    (inv) => !customerId || inv.customerId === parseInt(customerId, 10)
  );

  const columns = [
    { header: "Customer", accessorKey: "customerName" as const },
    { header: "Date", cell: (item: PaymentReceived) => formatDate(item.date) },
    { header: "Payment Method", accessorKey: "paymentMethod" as const },
    {
      header: "Reference",
      cell: (item: PaymentReceived) =>
        item.reference || <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Amount",
      cell: (item: PaymentReceived) => (
        <span className="font-medium text-green-600">{formatCurrency(item.amount)}</span>
      ),
    },
    {
      header: "",
      cell: (item: PaymentReceived) => (
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
      title="Payments Received"
      description="Track customer payments against invoices."
      actionLabel="Record Payment"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={payments}
        isLoading={isLoading}
        emptyTitle="No payments received"
        emptyDescription="Record customer payments here."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Record Payment Received"
        description="Log a payment received from a customer."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Record"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setInvoiceId("none"); }}>
              <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Apply to Invoice (optional)</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger><SelectValue placeholder="No specific invoice" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific invoice</SelectItem>
                {(filteredInvoices ?? []).map((inv) => (
                  <SelectItem key={inv.id} value={String(inv.id)}>
                    {inv.invoiceNumber} — {formatCurrency(inv.amountDue)} due
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Check #, transfer ID…"
            />
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
        title="Delete Payment"
        description="Are you sure you want to delete this payment record? This cannot be undone."
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
