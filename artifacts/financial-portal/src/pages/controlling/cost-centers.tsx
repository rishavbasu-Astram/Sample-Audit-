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
  useListCostCenters,
  useCreateCostCenter,
  useDeleteCostCenter,
  getListCostCentersQueryKey,
} from "@workspace/api-client-react";
import type { CostCenter, CostCenterInput } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type FormState = {
  code: string;
  name: string;
  manager: string;
  budgetedAmount: string;
  actualAmount: string;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  manager: "",
  budgetedAmount: "",
  actualAmount: "",
};

export function CostCentersPage() {
  const qc = useQueryClient();
  const { data: costCenters, isLoading } = useListCostCenters();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<CostCenter | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const createMutation = useCreateCostCenter({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCostCentersQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteCostCenter({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCostCentersQueryKey() });
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
    const data: CostCenterInput = {
      code: form.code,
      name: form.name,
      manager: form.manager || undefined,
      budgetedAmount: form.budgetedAmount ? parseFloat(form.budgetedAmount) : undefined,
      actualAmount: form.actualAmount ? parseFloat(form.actualAmount) : undefined,
    };
    createMutation.mutate({ data });
  }

  const columns = [
    { header: "Code", accessorKey: "code" as const },
    { header: "Name", accessorKey: "name" as const },
    {
      header: "Manager",
      cell: (item: CostCenter) =>
        item.manager ? (
          <span className="text-sm">{item.manager}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Budgeted",
      cell: (item: CostCenter) => <span className="font-medium">{formatCurrency(item.budgetedAmount)}</span>,
    },
    {
      header: "Actual",
      cell: (item: CostCenter) => <span className="font-medium">{formatCurrency(item.actualAmount)}</span>,
    },
    {
      header: "Variance",
      cell: (item: CostCenter) => (
        <span className={`font-medium ${item.variance < 0 ? "text-destructive" : "text-green-600"}`}>
          {formatCurrency(item.variance)}
        </span>
      ),
    },
    {
      header: "Status",
      cell: (item: CostCenter) => (
        <Badge variant={item.isActive ? "default" : "secondary"}>
          {item.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      header: "",
      cell: (item: CostCenter) => (
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
      title="Cost Centers"
      description="Track planned vs. actual spend across organisational cost centers."
      actionLabel="Add Cost Center"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={costCenters}
        isLoading={isLoading}
        emptyTitle="No cost centers found"
        emptyDescription="Create cost centers to tag and analyse spend by department or function."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Add Cost Center"
        description="Define a cost center with its planned and actual amounts."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Add Cost Center"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. CC-100" />
          </div>
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Engineering" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Manager</Label>
            <Input value={form.manager} onChange={(e) => set("manager", e.target.value)} placeholder="Responsible manager" />
          </div>
          <div className="space-y-1.5">
            <Label>Budgeted Amount</Label>
            <Input type="number" value={form.budgetedAmount} onChange={(e) => set("budgetedAmount", e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Actual Amount</Label>
            <Input type="number" value={form.actualAmount} onChange={(e) => set("actualAmount", e.target.value)} placeholder="0.00" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Cost Center"
        description={`Are you sure you want to delete cost center "${deleting?.code} — ${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
