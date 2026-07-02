import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListTaxRates,
  useCreateTaxRate,
  useUpdateTaxRate,
  useDeleteTaxRate,
  getListTaxRatesQueryKey,
} from "@workspace/api-client-react";
import type { TaxRate, TaxRateInput } from "@workspace/api-client-react";
import { Percent, Power, Trash2 } from "lucide-react";

const TAX_TYPES = ["vat", "gst", "sales_tax", "withholding", "other"] as const;

function taxTypeLabel(t: string): string {
  if (t === "vat") return "VAT";
  if (t === "gst") return "GST";
  if (t === "sales_tax") return "Sales Tax";
  if (t === "withholding") return "Withholding";
  return "Other";
}

type FormState = {
  name: string;
  rate: string;
  taxType: string;
  isCompound: string; // "yes" | "no"
};

const EMPTY: FormState = {
  name: "",
  rate: "",
  taxType: "vat",
  isCompound: "no",
};

export function TaxRatesPage() {
  const qc = useQueryClient();
  const { data: taxRates, isLoading } = useListTaxRates();

  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<TaxRate | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTaxRatesQueryKey() });

  const createMutation = useCreateTaxRate({
    mutation: { onSuccess: () => { invalidate(); setFormOpen(false); } },
  });
  const updateMutation = useUpdateTaxRate({ mutation: { onSuccess: invalidate } });
  const deleteMutation = useDeleteTaxRate({
    mutation: { onSuccess: () => { invalidate(); setDeleting(null); } },
  });

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.rate) return;
    const data: TaxRateInput = {
      name: form.name,
      rate: Number(form.rate),
      taxType: form.taxType,
      isCompound: form.isCompound === "yes",
    };
    createMutation.mutate({ data });
  }

  const columns = [
    { header: "Name", accessorKey: "name" as const },
    {
      header: "Rate",
      cell: (r: TaxRate) => (
        <span className="font-tabular-nums tabular-nums">{r.rate}%</span>
      ),
    },
    {
      header: "Type",
      cell: (r: TaxRate) => <span>{taxTypeLabel(r.taxType)}</span>,
    },
    {
      header: "Compound",
      cell: (r: TaxRate) => (
        <span className="text-sm text-muted-foreground">{r.isCompound ? "Yes" : "—"}</span>
      ),
    },
    {
      header: "Status",
      cell: (r: TaxRate) => <StatusBadge status={r.isActive ? "active" : "inactive"} />,
    },
    {
      header: "",
      cell: (r: TaxRate) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() =>
              updateMutation.mutate({
                id: r.id,
                data: { name: r.name, rate: r.rate, isActive: !r.isActive },
              })
            }
            title={r.isActive ? "Deactivate" : "Activate"}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleting(r)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageLayout
      title="Tax Rates"
      description="Manage tax rates applied to line items and documents. Rates are referenced by invoices, bills, and credit notes."
      actionLabel="New Tax Rate"
      onAction={() => { setForm(EMPTY); setFormOpen(true); }}
    >
      <DataTable
        columns={columns}
        data={taxRates}
        isLoading={isLoading}
        emptyTitle="No tax rates"
        emptyDescription="Add a tax rate to apply to invoices and bills, e.g. VAT 18% or GST 10%."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Tax Rate"
        description="Define a tax rate to apply to line items on invoices, bills, and other documents."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Tax Rate"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Standard VAT"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rate (%) *</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.0001}
                value={form.rate}
                onChange={(e) => set("rate", e.target.value)}
                placeholder="e.g. 18"
                className="pr-8"
              />
              <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.taxType} onValueChange={(v) => set("taxType", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {taxTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Compound</Label>
            <Select value={form.isCompound} onValueChange={(v) => set("isCompound", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Compound taxes are applied on top of other taxes already applied to the item.
            </p>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Tax Rate"
        description={`Delete "${deleting?.name}"? This tax rate may be referenced by existing line items or documents. Removing it will not retroactively change saved amounts, but future item lookups will lose this rate.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}

export default TaxRatesPage;
