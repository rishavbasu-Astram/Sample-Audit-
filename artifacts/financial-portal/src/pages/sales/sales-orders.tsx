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
import { LineItemsEditor, emptyLineItem } from "@/components/ui/line-items-editor";
import type { LineItemRow } from "@/components/ui/line-items-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListSalesOrders,
  useCreateSalesOrder,
  useDeleteSalesOrder,
  useListCustomers,
  getListSalesOrdersQueryKey,
} from "@workspace/api-client-react";
import type { SalesOrder, SalesOrderInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);
const net14 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

export function SalesOrdersPage() {
  const qc = useQueryClient();
  const { data: salesOrders, isLoading } = useListSalesOrders();
  const { data: customers } = useListCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<SalesOrder | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState(net14());
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);

  const createMutation = useCreateSalesOrder({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSalesOrdersQueryKey() }); setFormOpen(false); } },
  });
  const deleteMutation = useDeleteSalesOrder({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSalesOrdersQueryKey() }); setDeleteOpen(false); } },
  });

  function openCreate() {
    setCustomerId("");
    setDate(today());
    setDeliveryDate(net14());
    setNotes("");
    setLineItems([emptyLineItem()]);
    setFormOpen(true);
  }

  function openDelete(o: SalesOrder) {
    setDeleting(o);
    setDeleteOpen(true);
  }

  function handleSubmit() {
    if (!customerId || lineItems.length === 0) return;
    const payload: SalesOrderInput = {
      customerId: parseInt(customerId, 10),
      date,
      deliveryDate,
      notes: notes || undefined,
      lineItems: lineItems.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        taxRate: it.taxRate,
        amount: it.amount,
      })),
    };
    createMutation.mutate({ data: payload });
  }

  const columns = [
    { header: "Order #", accessorKey: "orderNumber" as const },
    { header: "Customer", accessorKey: "customerName" as const },
    { header: "Date", cell: (item: SalesOrder) => formatDate(item.date) },
    { header: "Delivery Date", cell: (item: SalesOrder) => item.deliveryDate ? formatDate(item.deliveryDate) : <span className="text-muted-foreground">—</span> },
    { header: "Total", cell: (item: SalesOrder) => <span className="font-medium">{formatCurrency(item.total)}</span> },
    { header: "Status", cell: (item: SalesOrder) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: SalesOrder) => (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => openDelete(item)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <PageLayout
      title="Sales Orders"
      description="Track customer orders before invoicing."
      actionLabel="Create Sales Order"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={salesOrders}
        isLoading={isLoading}
        emptyTitle="No sales orders"
        emptyDescription="Create your first sales order."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Sales Order"
        description="Select a customer, set dates, and add line items."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Order"
        size="xl"
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 space-y-1.5">
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.company ? ` — ${c.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Order Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Delivery Date</Label>
            <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, etc." />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Line Items *</Label>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Sales Order"
        description={`Are you sure you want to delete order "${deleting?.orderNumber}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
