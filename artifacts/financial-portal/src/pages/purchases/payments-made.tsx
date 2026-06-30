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
  useListPaymentsMade,
  useCreatePaymentMade,
  useDeletePaymentMade,
  useListVendors,
  useListBills,
  getListPaymentsMadeQueryKey,
} from "@workspace/api-client-react";
import type { PaymentMade, PaymentMadeInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const PAYMENT_METHODS = ["Cash", "Credit Card", "Bank Transfer", "Check", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

export function PaymentsMadePage() {
  const qc = useQueryClient();
  const { data: payments, isLoading } = useListPaymentsMade();
  const { data: vendors } = useListVendors();
  const { data: bills } = useListBills();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<PaymentMade | null>(null);

  const [vendorId, setVendorId] = useState("");
  const [billId, setBillId] = useState("none");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreatePaymentMade({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPaymentsMadeQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeletePaymentMade({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPaymentsMadeQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setVendorId("");
    setBillId("none");
    setDate(today());
    setAmount("");
    setPaymentMethod("Bank Transfer");
    setReference("");
    setNotes("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!vendorId || !amount) return;
    const payload: PaymentMadeInput = {
      vendorId: parseInt(vendorId, 10),
      date,
      amount: parseFloat(amount),
      paymentMethod,
      reference: reference || undefined,
      billId: billId !== "none" ? parseInt(billId, 10) : undefined,
      notes: notes || undefined,
    };
    createMutation.mutate({ data: payload });
  }

  const filteredBills = bills?.filter(
    (b) => !vendorId || b.vendorId === parseInt(vendorId, 10)
  );

  const columns = [
    { header: "Vendor", accessorKey: "vendorName" as const },
    { header: "Date", cell: (item: PaymentMade) => formatDate(item.date) },
    { header: "Payment Method", accessorKey: "paymentMethod" as const },
    {
      header: "Reference",
      cell: (item: PaymentMade) =>
        item.reference || <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Amount",
      cell: (item: PaymentMade) => (
        <span className="font-medium text-red-600">{formatCurrency(item.amount)}</span>
      ),
    },
    {
      header: "",
      cell: (item: PaymentMade) => (
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
      title="Payments Made"
      description="Track payments made to vendors."
      actionLabel="Record Payment"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={payments}
        isLoading={isLoading}
        emptyTitle="No payments made"
        emptyDescription="Record payments made to your vendors."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Record Payment Made"
        description="Log a payment sent to a vendor."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Record"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={(v) => { setVendorId(v); setBillId("none"); }}>
              <SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger>
              <SelectContent>
                {(vendors ?? []).map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Apply to Bill (optional)</Label>
            <Select value={billId} onValueChange={setBillId}>
              <SelectTrigger><SelectValue placeholder="No specific bill" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific bill</SelectItem>
                {(filteredBills ?? []).map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.billNumber} — {formatCurrency(b.amountDue)} due
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
              placeholder="Check #, wire ref…"
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
