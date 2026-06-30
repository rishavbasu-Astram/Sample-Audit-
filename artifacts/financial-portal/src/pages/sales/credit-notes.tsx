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
  useListCreditNotes,
  useCreateCreditNote,
  useDeleteCreditNote,
  useListCustomers,
  getListCreditNotesQueryKey,
} from "@workspace/api-client-react";
import type { CreditNote, CreditNoteInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

export function CreditNotesPage() {
  const qc = useQueryClient();
  const { data: creditNotes, isLoading } = useListCreditNotes();
  const { data: customers } = useListCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<CreditNote | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);

  const createMutation = useCreateCreditNote({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCreditNotesQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteCreditNote({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCreditNotesQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setCustomerId("");
    setDate(today());
    setNotes("");
    setLineItems([emptyLineItem()]);
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!customerId || lineItems.length === 0) return;
    const payload: CreditNoteInput = {
      customerId: parseInt(customerId, 10),
      date,
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
    { header: "Credit Note #", accessorKey: "creditNoteNumber" as const },
    { header: "Customer", accessorKey: "customerName" as const },
    { header: "Date", cell: (item: CreditNote) => formatDate(item.date) },
    {
      header: "Amount",
      cell: (item: CreditNote) => <span className="font-medium">{formatCurrency(item.amount)}</span>,
    },
    {
      header: "Balance",
      cell: (item: CreditNote) => <span className="font-medium">{formatCurrency(item.balance)}</span>,
    },
    { header: "Status", cell: (item: CreditNote) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: CreditNote) => (
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
      title="Credit Notes"
      description="Manage customer credits and refunds."
      actionLabel="Create Credit Note"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={creditNotes}
        isLoading={isLoading}
        emptyTitle="No credit notes"
        emptyDescription="Create your first credit note."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Credit Note"
        description="Issue a credit to a customer with itemised amounts."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Credit Note"
        size="xl"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
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
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for credit…" />
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
        title="Delete Credit Note"
        description={`Are you sure you want to delete credit note "${deleting?.creditNoteNumber}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
