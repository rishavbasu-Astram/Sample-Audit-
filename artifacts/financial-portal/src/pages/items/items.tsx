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
  useListItems,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
  getListItemsQueryKey,
  useListTaxRates,
  getListTaxRatesQueryKey,
} from "@workspace/api-client-react";
import type { Item, ItemInput, TaxRate } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Package, Power, Trash2 } from "lucide-react";

type FormState = {
  name: string;
  itemType: string;
  sku: string;
  unit: string;
  sellingPrice: string;
  costPrice: string;
  taxRateId: string;
  trackInventory: string;
  stockOnHand: string;
  reorderLevel: string;
};

const EMPTY: FormState = {
  name: "",
  itemType: "service",
  sku: "",
  unit: "",
  sellingPrice: "0",
  costPrice: "0",
  taxRateId: "",
  trackInventory: "no",
  stockOnHand: "0",
  reorderLevel: "",
};

export function ItemsPage() {
  const qc = useQueryClient();
  const { data: items, isLoading } = useListItems();
  const { data: taxRates } = useListTaxRates();

  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const invalidateItems = () => qc.invalidateQueries({ queryKey: getListItemsQueryKey() });

  const createMutation = useCreateItem({
    mutation: {
      onSuccess: () => {
        invalidateItems();
        setFormOpen(false);
      },
    },
  });
  const updateMutation = useUpdateItem({ mutation: { onSuccess: invalidateItems } });
  const deleteMutation = useDeleteItem({
    mutation: {
      onSuccess: () => {
        invalidateItems();
        setDeleting(null);
      },
    },
  });

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    const tracking = form.trackInventory === "yes";
    const data: ItemInput = {
      name: form.name,
      itemType: form.itemType,
      ...(form.sku.trim() ? { sku: form.sku.trim() } : {}),
      ...(form.unit.trim() ? { unit: form.unit.trim() } : {}),
      sellingPrice: Number(form.sellingPrice || 0),
      costPrice: Number(form.costPrice || 0),
      taxRateId: form.taxRateId ? Number(form.taxRateId) : null,
      trackInventory: tracking,
      ...(tracking && form.stockOnHand ? { stockOnHand: Number(form.stockOnHand) } : {}),
      ...(tracking && form.reorderLevel ? { reorderLevel: Number(form.reorderLevel) } : {}),
    };
    createMutation.mutate({ data });
  }

  const taxMap = new Map<number, TaxRate>(
    (taxRates ?? []).map((t) => [t.id, t]),
  );

  const columns = [
    {
      header: "Name",
      cell: (item: Item) => (
        <div>
          <span className="font-medium">{item.name}</span>
          {item.sku && (
            <div className="text-xs text-muted-foreground">{item.sku}</div>
          )}
        </div>
      ),
    },
    {
      header: "Type",
      cell: (item: Item) => (
        <span className="capitalize">{item.itemType}</span>
      ),
    },
    {
      header: "Selling Price",
      cell: (item: Item) => (
        <span className="font-medium">{formatCurrency(item.sellingPrice)}</span>
      ),
    },
    {
      header: "Cost Price",
      cell: (item: Item) => formatCurrency(item.costPrice),
    },
    {
      header: "Tax",
      cell: (item: Item) =>
        item.taxRateName && item.taxRatePercent != null
          ? `${item.taxRateName} (${item.taxRatePercent}%)`
          : "—",
    },
    {
      header: "Stock",
      cell: (item: Item) => {
        if (!item.trackInventory) return <span className="text-muted-foreground">—</span>;
        if (item.belowReorder) {
          return (
            <span className="text-amber-600">
              {item.stockOnHand} <span className="text-xs">(low)</span>
            </span>
          );
        }
        return <span>{item.stockOnHand}</span>;
      },
    },
    {
      header: "Status",
      cell: (item: Item) => (
        <StatusBadge status={item.isActive ? "active" : "inactive"} />
      ),
    },
    {
      header: "",
      cell: (item: Item) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() =>
              updateMutation.mutate({
                id: item.id,
                data: { name: item.name, isActive: !item.isActive },
              })
            }
            title={item.isActive ? "Deactivate" : "Activate"}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleting(item)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const tracking = form.trackInventory === "yes";

  return (
    <PageLayout
      title="Items"
      description="Manage goods and services sold or purchased. Assign tax rates, track stock on hand, and set reorder alerts for inventory items."
      actionLabel="New Item"
      onAction={() => {
        setForm(EMPTY);
        setFormOpen(true);
      }}
    >
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        emptyTitle="No items yet"
        emptyDescription="Add a product or service to start using it on invoices and purchase orders."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Item"
        description="Create a product (goods) or service. Enable inventory tracking to monitor stock levels."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Item"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Web Design Service"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.itemType} onValueChange={(v) => set("itemType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="goods">Goods</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>SKU</Label>
            <Input
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="Optional stock-keeping unit"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Input
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="e.g. hrs, pcs, kg"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tax Rate</Label>
            <Select
              value={form.taxRateId}
              onValueChange={(v) => set("taxRateId", v)}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {(taxRates ?? []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} ({t.rate}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Selling Price</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.sellingPrice}
              onChange={(e) => set("sellingPrice", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cost Price</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.costPrice}
              onChange={(e) => set("costPrice", e.target.value)}
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label>Track Inventory</Label>
            <Select value={form.trackInventory} onValueChange={(v) => set("trackInventory", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tracking && (
            <>
              <div className="space-y-1.5">
                <Label>Opening Stock</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.stockOnHand}
                  onChange={(e) => set("stockOnHand", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reorder Level</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reorderLevel}
                  onChange={(e) => set("reorderLevel", e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </>
          )}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete Item"
        description={`Delete "${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}

export default ItemsPage;
