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
  useListPaymentLinks,
  useCreatePaymentLink,
  useDeletePaymentLink,
  getListPaymentLinksQueryKey,
} from "@workspace/api-client-react";
import type { PaymentLink } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD"];

export function PaymentLinksPage() {
  const qc = useQueryClient();
  const { data: paymentLinks, isLoading } = useListPaymentLinks();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<PaymentLink | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [expiresAt, setExpiresAt] = useState("");

  const createMutation = useCreatePaymentLink({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPaymentLinksQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeletePaymentLink({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPaymentLinksQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setTitle("");
    setAmount("");
    setCurrency("USD");
    setExpiresAt("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!title.trim() || !amount) return;
    createMutation.mutate({
      data: {
        title,
        amount: parseFloat(amount),
        currency,
        expiresAt: expiresAt || undefined,
      },
    });
  }

  const columns = [
    { header: "Title", accessorKey: "title" as const },
    {
      header: "Amount",
      cell: (item: PaymentLink) => <span className="font-medium">{formatCurrency(item.amount, item.currency)}</span>,
    },
    {
      header: "Link",
      cell: (item: PaymentLink) => (
        <a href={item.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm">
          Open
        </a>
      ),
    },
    { header: "Expires At", cell: (item: PaymentLink) => formatDate(item.expiresAt) },
    { header: "Status", cell: (item: PaymentLink) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: PaymentLink) => (
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
      title="Payment Links"
      description="Create and manage shareable payment links."
      actionLabel="Create Payment Link"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={paymentLinks}
        isLoading={isLoading}
        emptyTitle="No payment links"
        emptyDescription="Create a payment link to get paid quickly."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Payment Link"
        description="Generate a shareable link for a fixed amount."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Consulting deposit" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Currency *</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Expires At</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Payment Link"
        description={`Delete the payment link "${deleting?.title}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
