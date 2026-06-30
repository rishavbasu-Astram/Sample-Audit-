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
  useListAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  getListAssetsQueryKey,
} from "@workspace/api-client-react";
import type { Asset, AssetInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";

const ASSET_TYPES = ["Equipment", "Vehicle", "Furniture", "Building", "Land", "Intangible", "Other"];
const DEPRECIATION_METHODS = ["Straight-Line", "Declining Balance", "Units of Production", "None"];

const EMPTY: AssetInput = {
  name: "",
  assetType: "Equipment",
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchasePrice: 0,
  currentValue: 0,
  depreciationMethod: "Straight-Line",
  status: "active",
  notes: "",
};

export function AssetsPage() {
  const qc = useQueryClient();
  const { data: assets, isLoading } = useListAssets();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [form, setForm] = useState<AssetInput>(EMPTY);

  const createMutation = useCreateAsset({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAssetsQueryKey() }); setFormOpen(false); } },
  });
  const updateMutation = useUpdateAsset({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAssetsQueryKey() }); setFormOpen(false); } },
  });
  const deleteMutation = useDeleteAsset({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListAssetsQueryKey() }); setDeleteOpen(false); } },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(a: Asset) {
    setEditing(a);
    setForm({
      name: a.name,
      assetType: a.assetType,
      purchaseDate: a.purchaseDate,
      purchasePrice: a.purchasePrice,
      currentValue: a.currentValue,
      depreciationMethod: a.depreciationMethod ?? "Straight-Line",
      status: a.status,
      notes: a.notes ?? "",
    });
    setFormOpen(true);
  }

  function openDelete(a: Asset) {
    setDeleting(a);
    setDeleteOpen(true);
  }

  function set(field: keyof AssetInput, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        data: {
          name: form.name,
          currentValue: Number(form.currentValue),
          status: form.status,
          notes: form.notes,
        },
      });
    } else {
      createMutation.mutate({
        data: {
          ...form,
          purchasePrice: Number(form.purchasePrice),
          currentValue: Number(form.currentValue),
        },
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const columns = [
    { header: "Name", accessorKey: "name" as const },
    { header: "Type", accessorKey: "assetType" as const },
    { header: "Purchase Date", cell: (item: Asset) => formatDate(item.purchaseDate) },
    {
      header: "Purchase Price",
      cell: (item: Asset) => <span className="font-medium">{formatCurrency(item.purchasePrice)}</span>,
    },
    {
      header: "Current Value",
      cell: (item: Asset) => <span className="font-medium">{formatCurrency(item.currentValue)}</span>,
    },
    { header: "Status", cell: (item: Asset) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: Asset) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => openDelete(item)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageLayout
      title="Asset Registry"
      description="Manage company assets and track depreciation."
      actionLabel="Add Asset"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={assets}
        isLoading={isLoading}
        emptyTitle="No assets found"
        emptyDescription="Get started by adding your first company asset."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Edit Asset" : "Add Asset"}
        description={editing ? "Update asset details and current value." : "Register a new company asset."}
        onSubmit={handleSubmit}
        isSubmitting={isSaving}
        submitLabel={editing ? "Update" : "Add Asset"}
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Asset Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. MacBook Pro 16-inch" />
          </div>
          <div className="space-y-1.5">
            <Label>Asset Type</Label>
            <Select value={form.assetType} onValueChange={(v) => set("assetType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Purchase Date</Label>
            <Input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => set("purchaseDate", e.target.value)}
              disabled={!!editing}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Purchase Price</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.purchasePrice}
              onChange={(e) => set("purchasePrice", e.target.value)}
              disabled={!!editing}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Current Value</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.currentValue}
              onChange={(e) => set("currentValue", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Depreciation Method</Label>
            <Select
              value={form.depreciationMethod ?? "None"}
              onValueChange={(v) => set("depreciationMethod", v)}
              disabled={!!editing}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPRECIATION_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disposed">Disposed</SelectItem>
                <SelectItem value="fully_depreciated">Fully Depreciated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Input value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Asset"
        description={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
