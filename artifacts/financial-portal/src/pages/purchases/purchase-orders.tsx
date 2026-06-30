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
  useListPurchaseOrders,
  useCreatePurchaseOrder,
  useDeletePurchaseOrder,
  useListVendors,
  getListPurchaseOrdersQueryKey,
} from "@workspace/api-client-react";
import type { PurchaseOrder, PurchaseOrderInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2 } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);
const net14 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

export function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const { data: purchaseOrders, isLoading } = useListPurchaseOrders();
  const { data: vendors } = useListVendors();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<PurchaseOrder | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [date, setDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState(net14());
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);

  const createMutation = useCreatePurchaseOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeletePurchaseOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setVendorId("");
    setDate(today());
    setExpectedDate(net14());
    setNotes("");
    setLineItems([emptyLineItem()]);
    setFormOpen(true);
  }

  function openDelete(po: PurchaseOrder) {
    setDeleting(po);
    setDeleteOpen(true);
  }

  function handleSubmit() {
    if (!vendorId || lineItems.length === 0) return;
    const payload: PurchaseOrderInput = {
      vendorId: parseInt(vendorId, 10),
      date,
      expectedDate: expectedDate || undefined,
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
    { header: "PO #", accessorKey: "poNumber" as const },
    { header: "Vendor", accessorKey: "vendorName" as const },
    { header: "Date", cell: (item: PurchaseOrder) => formatDate(item.date) },
    {
      header: "Expected Date",
      cell: (item: PurchaseOrder) =>
        item.expectedDate ? formatDate(item.expectedDate) : <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Total",
      cell: (item: PurchaseOrder) => <span className="font-medium">{formatCurrency(item.total)}</span>,
    },
    { header: "Status", cell: (item: PurchaseOrder) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: PurchaseOrder) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => openDelete(item)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <PageLayout
      title="Purchase Orders"
      description="Create and manage purchase orders to vendors."
      actionLabel="Create Purchase Order"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={purchaseOrders}
        isLoading={isLoading}
        emptyTitle="No purchase orders"
        emptyDescription="Create your first purchase order."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Purchase Order"
        description="Select a vendor, set dates, and add line items."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create PO"
        size="xl"
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 space-y-1.5">
            <Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a vendor" />
              </SelectTrigger>
              <SelectContent>
                {(vendors ?? []).map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}{v.company ? ` — ${v.company}` : ""}
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
            <Label>Expected Delivery</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
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
        title="Delete Purchase Order"
        description={`Are you sure you want to delete PO "${deleting?.poNumber}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
