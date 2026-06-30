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
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import type { Customer, CustomerInput } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";

const EMPTY: CustomerInput = {
  name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  taxNumber: "",
  currency: "USD",
  status: "active",
};

export function CustomersPage() {
  const qc = useQueryClient();
  const { data: customers, isLoading } = useListCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(EMPTY);

  const createMutation = useCreateCustomer({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCustomersQueryKey() }); setFormOpen(false); } },
  });
  const updateMutation = useUpdateCustomer({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCustomersQueryKey() }); setFormOpen(false); } },
  });
  const deleteMutation = useDeleteCustomer({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListCustomersQueryKey() }); setDeleteOpen(false); } },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      company: c.company ?? "",
      address: c.address ?? "",
      taxNumber: c.taxNumber ?? "",
      currency: c.currency,
      status: c.status,
    });
    setFormOpen(true);
  }

  function openDelete(c: Customer) {
    setDeleting(c);
    setDeleteOpen(true);
  }

  function set(field: keyof CustomerInput, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate({ data: form });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const columns = [
    { header: "Name", accessorKey: "name" as const },
    { header: "Company", accessorKey: "company" as const },
    { header: "Email", accessorKey: "email" as const },
    {
      header: "Outstanding Balance",
      cell: (item: Customer) => (
        <span className={`font-medium ${item.outstandingBalance > 0 ? "text-red-600" : ""}`}>
          {formatCurrency(item.outstandingBalance, item.currency)}
        </span>
      ),
    },
    {
      header: "Status",
      cell: (item: Customer) => <StatusBadge status={item.status} />,
    },
    {
      header: "",
      cell: (item: Customer) => (
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
      title="Customers"
      description="Manage your customer relationships and balances."
      actionLabel="Add Customer"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        emptyTitle="No customers yet"
        emptyDescription="Add customers to start creating quotes and invoices."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Edit Customer" : "Add Customer"}
        description={editing ? "Update customer details." : "Fill in the details to create a new customer."}
        onSubmit={handleSubmit}
        isSubmitting={isSaving}
        submitLabel={editing ? "Update" : "Create"}
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 000 0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" />
          </div>
          <div className="space-y-1.5">
            <Label>Tax Number</Label>
            <Input value={form.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} placeholder="VAT / EIN" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, City, Country" />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["USD", "EUR", "GBP", "AED", "SAR", "JPY", "CAD", "AUD"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Customer"
        description={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
