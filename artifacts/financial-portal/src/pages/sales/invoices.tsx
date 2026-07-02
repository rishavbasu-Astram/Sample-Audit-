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
import { LineItemsEditor, emptyLineItem } from "@/components/ui/line-items-editor";
import type { LineItemRow } from "@/components/ui/line-items-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListInvoices,
  useCreateInvoice,
  useListCustomers,
  useMarkInvoiceSent,
  useRecordInvoicePayment,
  useVoidInvoice,
  getListInvoicesQueryKey,
  getListPaymentsReceivedQueryKey,
} from "@workspace/api-client-react";
import type { Invoice, InvoiceInput, RecordPaymentInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Download, Send, Banknote, Ban } from "lucide-react";

function DownloadPdfButton({ invoiceId, invoiceNumber }: { invoiceId: number; invoiceNumber: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (!response.ok) throw new Error("Failed to generate PDF");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDownload}
      disabled={loading}
      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
      title="Download PDF"
    >
      <Download className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
    </Button>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const net30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

export function InvoicesPage() {
  const qc = useQueryClient();
  const { data: invoices, isLoading } = useListInvoices();
  const { data: customers } = useListCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState(net30());
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);

  // Lifecycle action state
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payReference, setPayReference] = useState("");
  const [payError, setPayError] = useState("");

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    qc.invalidateQueries({ queryKey: getListPaymentsReceivedQueryKey() });
  }

  const markSentMutation = useMarkInvoiceSent({ mutation: { onSuccess: invalidateAll } });
  const recordPaymentMutation = useRecordInvoicePayment({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setPayTarget(null);
      },
    },
  });
  const voidMutation = useVoidInvoice({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setVoidTarget(null);
      },
    },
  });

  function openPayDialog(inv: Invoice) {
    setPayTarget(inv);
    setPayAmount(String(inv.amountDue));
    setPayDate(today());
    setPayMethod("bank_transfer");
    setPayReference("");
    setPayError("");
  }

  function handleRecordPayment() {
    if (!payTarget) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) { setPayError("Amount must be greater than 0"); return; }
    if (amt > payTarget.amountDue + 0.005) { setPayError(`Amount cannot exceed amount due (${formatCurrency(payTarget.amountDue)})`); return; }
    setPayError("");
    const data: RecordPaymentInput = {
      amount: amt,
      date: payDate || undefined,
      paymentMethod: payMethod || undefined,
      reference: payReference || undefined,
    };
    recordPaymentMutation.mutate({ id: payTarget.id, data });
  }

  const createMutation = useCreateInvoice({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        setFormOpen(false);
      },
    },
  });

  function openCreate() {
    setCustomerId("");
    setDate(today());
    setDueDate(net30());
    setNotes("");
    setLineItems([emptyLineItem()]);
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!customerId || lineItems.length === 0) return;
    const payload: InvoiceInput = {
      customerId: parseInt(customerId, 10),
      date,
      dueDate,
      notes: notes || undefined,
      lineItems: lineItems.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        taxRate: it.taxRate,
        amount: it.amount,
      })),
    };
    createMutation.mutate({ data: payload });
  }

  const columns = [
    { header: "Invoice #", accessorKey: "invoiceNumber" as const },
    { header: "Customer", accessorKey: "customerName" as const },
    { header: "Date", cell: (item: Invoice) => formatDate(item.date) },
    { header: "Due Date", cell: (item: Invoice) => formatDate(item.dueDate) },
    {
      header: "Amount Due",
      cell: (item: Invoice) => (
        <span className={`font-medium ${item.amountDue > 0 ? "" : "text-green-600"}`}>
          {formatCurrency(item.amountDue)}
        </span>
      ),
    },
    { header: "Total", cell: (item: Invoice) => <span className="font-medium">{formatCurrency(item.total)}</span> },
    { header: "Status", cell: (item: Invoice) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: Invoice) => (
        <div className="flex items-center justify-end gap-1">
          {item.status === "draft" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title="Mark as sent"
              onClick={() => markSentMutation.mutate({ id: item.id })}
              disabled={markSentMutation.isPending}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
          {(item.status === "sent" || item.status === "partially_paid") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title="Record payment"
              onClick={() => openPayDialog(item)}
            >
              <Banknote className="h-3.5 w-3.5" />
            </Button>
          )}
          {item.status !== "paid" && item.status !== "cancelled" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title="Void invoice"
              onClick={() => setVoidTarget(item)}
            >
              <Ban className="h-3.5 w-3.5" />
            </Button>
          )}
          <DownloadPdfButton invoiceId={item.id} invoiceNumber={item.invoiceNumber} />
        </div>
      ),
    },
  ];

  return (
    <PageLayout
      title="Invoices"
      description="Track and manage customer invoices."
      actionLabel="Create Invoice"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        emptyTitle="No invoices created"
        emptyDescription="Create your first invoice to bill a customer."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Invoice"
        description="Select a customer, set dates, and add line items."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Invoice"
        size="xl"
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 space-y-1.5">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.company ? ` — ${c.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Invoice Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due Date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Line Items *</Label>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
        </div>
      </FormDialog>

      {/* Record Payment Dialog */}
      <FormDialog
        open={!!payTarget}
        onOpenChange={(o) => !o && setPayTarget(null)}
        title="Record Payment"
        description={payTarget ? `Invoice ${payTarget.invoiceNumber} — Amount due: ${formatCurrency(payTarget.amountDue)}` : ""}
        onSubmit={handleRecordPayment}
        isSubmitting={recordPaymentMutation.isPending}
        submitLabel="Record Payment"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Amount *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.00"
            />
            {payError && <p className="text-xs text-destructive">{payError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select value={payMethod} onValueChange={setPayMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Reference</Label>
            <Input
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="Transaction ID, cheque number, etc. (optional)"
            />
          </div>
        </div>
      </FormDialog>

      {/* Void Confirm Dialog */}
      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title="Void Invoice"
        description={`Void invoice ${voidTarget?.invoiceNumber}? This will cancel it and set the amount due to zero. This cannot be undone.`}
        onConfirm={() => voidTarget && voidMutation.mutate({ id: voidTarget.id })}
        isLoading={voidMutation.isPending}
      />
    </PageLayout>
  );
}
