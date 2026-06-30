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
import { Badge } from "@/components/ui/badge";
import {
  useListChartOfAccounts,
  useCreateAccount,
  useDeleteAccount,
  getListChartOfAccountsQueryKey,
} from "@workspace/api-client-react";
import type { Account, AccountInput } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"];
const SUBTYPES: Record<string, string[]> = {
  asset: ["current", "fixed", "other"],
  liability: ["current", "long-term", "other"],
  equity: ["retained earnings", "capital", "other"],
  revenue: ["operating", "non-operating", "other"],
  expense: ["operating", "non-operating", "other"],
};

const TYPE_COLORS: Record<string, string> = {
  asset: "bg-blue-100 text-blue-800",
  liability: "bg-red-100 text-red-800",
  equity: "bg-purple-100 text-purple-800",
  revenue: "bg-green-100 text-green-800",
  expense: "bg-orange-100 text-orange-800",
};

const EMPTY: AccountInput = {
  code: "",
  name: "",
  type: "asset",
  subtype: "",
  description: "",
};

export function ChartOfAccountsPage() {
  const qc = useQueryClient();
  const { data: accounts, isLoading } = useListChartOfAccounts();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountInput>(EMPTY);

  const createMutation = useCreateAccount({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChartOfAccountsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteAccount({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListChartOfAccountsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function set(field: keyof AccountInput, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openCreate() {
    setForm(EMPTY);
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!form.code.trim() || !form.name.trim()) return;
    createMutation.mutate({
      data: {
        code: form.code,
        name: form.name,
        type: form.type,
        subtype: form.subtype || undefined,
        description: form.description || undefined,
      },
    });
  }

  const columns = [
    { header: "Code", accessorKey: "code" as const },
    { header: "Name", accessorKey: "name" as const },
    {
      header: "Type",
      cell: (item: Account) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${TYPE_COLORS[item.type] ?? ""}`}>
          {item.type}
        </span>
      ),
    },
    {
      header: "Subtype",
      cell: (item: Account) =>
        item.subtype ? (
          <span className="capitalize text-muted-foreground text-sm">{item.subtype}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Balance",
      cell: (item: Account) => <span className="font-medium">{formatCurrency(item.balance)}</span>,
    },
    {
      header: "Status",
      cell: (item: Account) => (
        <Badge variant={item.isActive ? "default" : "secondary"}>
          {item.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      header: "",
      cell: (item: Account) => (
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
      title="Chart of Accounts"
      description="Manage your general ledger accounts."
      actionLabel="Add Account"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={accounts}
        isLoading={isLoading}
        emptyTitle="No accounts found"
        emptyDescription="Set up your chart of accounts to start tracking finances."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Add Account"
        description="Create a new ledger account for your chart of accounts."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Add Account"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Account Code *</Label>
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="e.g. 1000, 4100"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Cash and Cash Equivalents"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={form.type} onValueChange={(v) => { set("type", v); set("subtype", ""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subtype</Label>
            <Select value={form.subtype ?? ""} onValueChange={(v) => set("subtype", v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {(SUBTYPES[form.type] ?? []).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional description of this account"
            />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Account"
        description={`Are you sure you want to delete account "${deleting?.code} — ${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
