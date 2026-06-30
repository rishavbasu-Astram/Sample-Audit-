import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
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
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import type { Invoice, InvoiceInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Download } from "lucide-react";

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
        <DownloadPdfButton invoiceId={item.id} invoiceNumber={item.invoiceNumber} />
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
    </PageLayout>
  );
}
