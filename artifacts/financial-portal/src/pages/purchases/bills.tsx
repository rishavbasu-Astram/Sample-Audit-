import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
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
  useListBills,
  useCreateBill,
  useListVendors,
  getListBillsQueryKey,
} from "@workspace/api-client-react";
import type { Bill, BillInput } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Download } from "lucide-react";

function DownloadPdfButton({ billId, billNumber }: { billId: number; billNumber: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const response = await fetch(`/api/bills/${billId}/pdf`);
      if (!response.ok) throw new Error("Failed to generate PDF");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bill-${billNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDownload}
      disabled={loading}
      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
      title="Download PDF"
    >
      <Download className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
    </Button>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const net30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

export function BillsPage() {
  const qc = useQueryClient();
  const { data: bills, isLoading } = useListBills();
  const { data: vendors } = useListVendors();

  const [formOpen, setFormOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState(net30());
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);

  const createMutation = useCreateBill({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBillsQueryKey() });
        setFormOpen(false);
      },
    },
  });

  function openCreate() {
    setVendorId("");
    setDate(today());
    setDueDate(net30());
    setNotes("");
    setLineItems([emptyLineItem()]);
    setFormOpen(true);
  }

  function handleSubmit() {
    if (!vendorId || lineItems.length === 0) return;
    const payload: BillInput = {
      vendorId: parseInt(vendorId, 10),
      date,
      dueDate,
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
    { header: "Bill #", accessorKey: "billNumber" as const },
    { header: "Vendor", accessorKey: "vendorName" as const },
    { header: "Date", cell: (item: Bill) => formatDate(item.date) },
    { header: "Due Date", cell: (item: Bill) => formatDate(item.dueDate) },
    {
      header: "Amount Due",
      cell: (item: Bill) => (
        <span className={`font-medium ${item.amountDue > 0 ? "text-red-600" : "text-green-600"}`}>
          {formatCurrency(item.amountDue)}
        </span>
      ),
    },
    { header: "Total", cell: (item: Bill) => <span className="font-medium">{formatCurrency(item.total)}</span> },
    { header: "Status", cell: (item: Bill) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: Bill) => (
        <DownloadPdfButton billId={item.id} billNumber={item.billNumber} />
      ),
    },
  ];

  return (
    <PageLayout
      title="Bills"
      description="Track and manage vendor bills."
      actionLabel="Create Bill"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={bills}
        isLoading={isLoading}
        emptyTitle="No bills created"
        emptyDescription="Record your first bill from a vendor."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Bill"
        description="Select a vendor, set dates, and add line items."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Bill"
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
            <Label>Bill Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due Date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Line Items *</Label>
          <LineItemsEditor items={lineItems} onChange={setLineItems} />
        </div>
      </FormDialog>
    </PageLayout>
  );
}
