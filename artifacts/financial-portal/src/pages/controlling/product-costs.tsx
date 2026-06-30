import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import {
  useListProducts,
  useCreateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import type { Product, ProductInput } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type FormState = {
  code: string;
  name: string;
  category: string;
  unit: string;
  standardCost: string;
  actualCost: string;
  quantity: string;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  category: "",
  unit: "",
  standardCost: "",
  actualCost: "",
  quantity: "",
};

export function ProductCostsPage() {
  const qc = useQueryClient();
  const { data: products, isLoading } = useListProducts();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const createMutation = useCreateProduct({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openCreate() {
    setForm(EMPTY);
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!form.code.trim() || !form.name.trim()) return;
    const data: ProductInput = {
      code: form.code,
      name: form.name,
      category: form.category || undefined,
      unit: form.unit || undefined,
      standardCost: form.standardCost ? parseFloat(form.standardCost) : undefined,
      actualCost: form.actualCost ? parseFloat(form.actualCost) : undefined,
      quantity: form.quantity ? parseFloat(form.quantity) : undefined,
    };
    createMutation.mutate({ data });
  }

  // For costs, an actual ABOVE standard is unfavourable (overrun) → red.
  const varianceClass = (v: number) => (v > 0 ? "text-destructive" : v < 0 ? "text-green-600" : "text-muted-foreground");

  const columns = [
    { header: "Code", accessorKey: "code" as const },
    { header: "Name", accessorKey: "name" as const },
    {
      header: "Category",
      cell: (item: Product) =>
        item.category ? <span className="text-sm">{item.category}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Std Cost",
      cell: (item: Product) => <span>{formatCurrency(item.standardCost)}</span>,
    },
    {
      header: "Actual Cost",
      cell: (item: Product) => <span>{formatCurrency(item.actualCost)}</span>,
    },
    {
      header: "Qty",
      cell: (item: Product) => (
        <span className="text-sm text-muted-foreground">
          {item.quantity.toLocaleString()}{item.unit ? ` ${item.unit}` : ""}
        </span>
      ),
    },
    {
      header: "Unit Var.",
      cell: (item: Product) => <span className={`font-medium ${varianceClass(item.unitVariance)}`}>{formatCurrency(item.unitVariance)}</span>,
    },
    {
      header: "Total Var.",
      cell: (item: Product) => <span className={`font-medium ${varianceClass(item.totalVariance)}`}>{formatCurrency(item.totalVariance)}</span>,
    },
    {
      header: "Status",
      cell: (item: Product) => (
        <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge>
      ),
    },
    {
      header: "",
      cell: (item: Product) => (
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
      title="Product Cost Controlling"
      description="Compare standard vs. actual product cost and track cost variance."
      actionLabel="Add Product"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={products}
        isLoading={isLoading}
        emptyTitle="No products found"
        emptyDescription="Add products with standard costs to start tracking cost variance."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Add Product"
        description="Define a product with its standard and actual unit cost."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Add Product"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. P-1001" />
          </div>
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Steel Bracket" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Hardware" />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. pcs, hr, kg" />
          </div>
          <div className="space-y-1.5">
            <Label>Standard Cost</Label>
            <Input type="number" value={form.standardCost} onChange={(e) => set("standardCost", e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Actual Cost</Label>
            <Input type="number" value={form.actualCost} onChange={(e) => set("actualCost", e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="0" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Product"
        description={`Are you sure you want to delete product "${deleting?.code} — ${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
