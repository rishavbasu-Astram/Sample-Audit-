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
  useListBudgets,
  useCreateBudget,
  useDeleteBudget,
  getListBudgetsQueryKey,
} from "@workspace/api-client-react";
import type { Budget } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const PERIODS = ["monthly", "quarterly", "yearly"];

export function BudgetsPage() {
  const qc = useQueryClient();
  const { data: budgets, isLoading } = useListBudgets();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const [name, setName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [period, setPeriod] = useState("yearly");
  const [budgetedAmount, setBudgetedAmount] = useState("");

  const createMutation = useCreateBudget({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteBudget({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setName("");
    setFiscalYear(String(new Date().getFullYear()));
    setPeriod("yearly");
    setBudgetedAmount("");
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!name.trim() || !fiscalYear.trim() || !budgetedAmount) return;
    const budgeted = parseFloat(budgetedAmount);
    createMutation.mutate({
      data: {
        name,
        fiscalYear,
        period,
        lines: [{ accountId: 0, accountName: "General", budgeted, actual: 0, variance: budgeted }],
      },
    });
  }

  const columns = [
    { header: "Name", accessorKey: "name" as const },
    { header: "Fiscal Year", accessorKey: "fiscalYear" as const },
    { header: "Period", cell: (item: Budget) => <span className="capitalize">{item.period}</span> },
    {
      header: "Total Budgeted",
      cell: (item: Budget) => <span className="font-medium">{formatCurrency(item.totalBudgeted)}</span>,
    },
    { header: "Total Actual", cell: (item: Budget) => formatCurrency(item.totalActual) },
    { header: "Status", cell: (item: Budget) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: Budget) => (
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
      title="Budgets"
      description="Plan and track your financial budgets."
      actionLabel="Create Budget"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={budgets}
        isLoading={isLoading}
        emptyTitle="No budgets created"
        emptyDescription="Create your first budget to start tracking performance."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Budget"
        description="Set a total budgeted amount for a fiscal period."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Budget"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operating Budget 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Fiscal Year *</Label>
            <Input value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="e.g. 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Period *</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Total Budgeted *</Label>
            <Input type="number" step="0.01" min={0} value={budgetedAmount} onChange={(e) => setBudgetedAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Budget"
        description={`Are you sure you want to delete budget "${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
