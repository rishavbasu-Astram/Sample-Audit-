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
  useListQuotes,
  useCreateQuote,
  useDeleteQuote,
  useListCustomers,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import type { Quote, QuoteInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);
const net30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

export function QuotesPage() {
  const qc = useQueryClient();
  const { data: quotes, isLoading } = useListQuotes();
  const { data: customers } = useListCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Quote | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState(net30());
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);

  const createMutation = useCreateQuote({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setFormOpen(false); } },
  });
  const deleteMutation = useDeleteQuote({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListQuotesQueryKey() }); setDeleteOpen(false); } },
  });

  function openCreate() {
    setCustomerId("");
    setDate(today());
    setExpiryDate(net30());
    setNotes("");
    setLineItems([emptyLineItem()]);
    setFormOpen(true);
  }

  function openDelete(q: Quote) {
    setDeleting(q);
    setDeleteOpen(true);
  }

  function handleSubmit() {
    if (!customerId || lineItems.length === 0) return;
    const payload: QuoteInput = {
      customerId: parseInt(customerId, 10),
      date,
      expiryDate,
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
    { header: "Quote #", accessorKey: "quoteNumber" as const },
    { header: "Customer", accessorKey: "customerName" as const },
    { header: "Date", cell: (item: Quote) => formatDate(item.date) },
    { header: "Expiry Date", cell: (item: Quote) => formatDate(item.expiryDate) },
    { header: "Total", cell: (item: Quote) => <span className="font-medium">{formatCurrency(item.total)}</span> },
    { header: "Status", cell: (item: Quote) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: Quote) => (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => openDelete(item)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <PageLayout
      title="Quotes"
      description="Manage and send quotes to customers."
      actionLabel="Create Quote"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={quotes}
        isLoading={isLoading}
        emptyTitle="No quotes yet"
        emptyDescription="Create a quote to send to your customers."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Quote"
        description="Select a customer, set dates, and add line items."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Quote"
        size="xl"
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 space-y-1.5">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
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
            <Label>Quote Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry Date</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes or terms" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Line Items *</Label>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Quote"
        description={`Are you sure you want to delete quote "${deleting?.quoteNumber}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
