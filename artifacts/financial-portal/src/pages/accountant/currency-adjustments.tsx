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
  useListCurrencyAdjustments,
  useCreateCurrencyAdjustment,
  useDeleteCurrencyAdjustment,
  getListCurrencyAdjustmentsQueryKey,
} from "@workspace/api-client-react";
import type { CurrencyAdjustment } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD"];
const today = () => new Date().toISOString().slice(0, 10);

export function CurrencyAdjustmentsPage() {
  const qc = useQueryClient();
  const { data: adjustments, isLoading } = useListCurrencyAdjustments();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<CurrencyAdjustment | null>(null);
  const [date, setDate] = useState(today());
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("EUR");
  const [exchangeRate, setExchangeRate] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreateCurrencyAdjustment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCurrencyAdjustmentsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteCurrencyAdjustment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCurrencyAdjustmentsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setDate(today());
    setFromCurrency("USD");
    setToCurrency("EUR");
    setExchangeRate("");
    setAdjustmentAmount("");
    setNotes("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!exchangeRate || !adjustmentAmount) return;
    createMutation.mutate({
      data: {
        date,
        fromCurrency,
        toCurrency,
        exchangeRate: parseFloat(exchangeRate),
        adjustmentAmount: parseFloat(adjustmentAmount),
        notes: notes || undefined,
      },
    });
  }

  const columns = [
    { header: "Date", cell: (item: CurrencyAdjustment) => formatDate(item.date) },
    { header: "From", accessorKey: "fromCurrency" as const },
    { header: "To", accessorKey: "toCurrency" as const },
    { header: "Exchange Rate", cell: (item: CurrencyAdjustment) => item.exchangeRate.toFixed(4) },
    {
      header: "Adjustment",
      cell: (item: CurrencyAdjustment) => (
        <span className="font-medium">{formatCurrency(item.adjustmentAmount, item.toCurrency)}</span>
      ),
    },
    {
      header: "",
      cell: (item: CurrencyAdjustment) => (
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
      title="Currency Adjustments"
      description="Manage exchange rate adjustments and unrealized gains/losses."
      actionLabel="Create Adjustment"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={adjustments}
        isLoading={isLoading}
        emptyTitle="No currency adjustments"
        emptyDescription="Create manual exchange rate adjustments."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Currency Adjustment"
        description="Record an exchange-rate adjustment between two currencies."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Exchange Rate *</Label>
            <Input type="number" step="0.0001" min={0} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="0.0000" />
          </div>
          <div className="space-y-1.5">
            <Label>From Currency *</Label>
            <Select value={fromCurrency} onValueChange={setFromCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To Currency *</Label>
            <Select value={toCurrency} onValueChange={setToCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Adjustment Amount *</Label>
            <Input type="number" step="0.01" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} placeholder="0.00" />
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
        title="Delete Adjustment"
        description="Are you sure you want to delete this currency adjustment? This cannot be undone."
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
