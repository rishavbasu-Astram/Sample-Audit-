import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useGetInventoryValuation,
  getGetInventoryValuationQueryKey,
  useListInventoryMovements,
  getListInventoryMovementsQueryKey,
  useCreateInventoryMovement,
  useListItems,
  getListItemsQueryKey,
} from "@workspace/api-client-react";
import type {
  ItemValuationRow,
  InventoryMovement,
  InventoryMovementInput,
  Item,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Boxes, TrendingDown, Plus } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type MovementType = "purchase" | "sale" | "adjustment" | "opening";

const MOVEMENT_TYPES: MovementType[] = ["purchase", "sale", "adjustment", "opening"];

type FormState = {
  itemId: string;
  movementType: MovementType;
  quantity: string;
  unitCost: string;
  date: string;
  reference: string;
  notes: string;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: FormState = {
  itemId: "",
  movementType: "purchase",
  quantity: "",
  unitCost: "",
  date: todayStr(),
  reference: "",
  notes: "",
};

// ── KPI Stat card ─────────────────────────────────────────────────────────────

function Stat({
  title,
  value,
  icon,
  isLoading,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Movement type badge helpers ───────────────────────────────────────────────

function typeColor(t: string): string {
  if (t === "sale") return "text-red-600";
  if (t === "purchase" || t === "opening") return "text-green-600";
  return "text-amber-600"; // adjustment
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Unit cost shown for purchase / opening / adjustment only ──────────────────

function showUnitCost(t: MovementType): boolean {
  return t === "purchase" || t === "opening" || t === "adjustment";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InventoryValuationPage() {
  const qc = useQueryClient();

  const { data: valuation, isLoading: isLoadingVal } = useGetInventoryValuation();
  const { data: movements, isLoading: isLoadingMov } = useListInventoryMovements({});
  const { data: items } = useListItems();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const createMutation = useCreateInventoryMovement({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetInventoryValuationQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey({}) });
        qc.invalidateQueries({ queryKey: getListItemsQueryKey() });
        setFormOpen(false);
        setForm(EMPTY_FORM);
        setFormError(null);
      },
      onError: (err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "Failed to record movement";
        setFormError(msg);
      },
    },
  });

  // Only items that track inventory can receive movements.
  const trackedItems = (items ?? []).filter((i: Item) => i.trackInventory);

  function handleSubmit() {
    setFormError(null);

    // --- Client-side guards mirroring the API ---
    if (!form.itemId) {
      setFormError("Item is required");
      return;
    }
    const qty = Number(form.quantity);
    if (!form.quantity || !Number.isFinite(qty)) {
      setFormError("Quantity is required and must be a number");
      return;
    }
    if (form.movementType === "adjustment") {
      if (qty === 0) {
        setFormError("Quantity must not be zero for adjustment");
        return;
      }
    } else {
      if (qty <= 0) {
        setFormError(`Quantity must be > 0 for ${form.movementType}`);
        return;
      }
    }
    if (form.movementType === "purchase" || form.movementType === "opening") {
      const cost = Number(form.unitCost);
      if (!form.unitCost || !Number.isFinite(cost) || cost < 0) {
        setFormError("Unit cost is required and must be >= 0 for purchase and opening movements");
        return;
      }
    }

    const data: InventoryMovementInput = {
      itemId: Number(form.itemId),
      movementType: form.movementType,
      quantity: qty,
      ...(showUnitCost(form.movementType) && form.unitCost
        ? { unitCost: Number(form.unitCost) }
        : {}),
      ...(form.date ? { date: form.date } : {}),
      ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    createMutation.mutate({ data });
  }

  // ── Valuation table columns ─────────────────────────────────────────────────

  const valuationColumns = [
    {
      header: "Item",
      cell: (row: ItemValuationRow) => (
        <div>
          <span className="font-medium">{row.itemName}</span>
          {row.sku && (
            <div className="text-xs text-muted-foreground">{row.sku}</div>
          )}
        </div>
      ),
    },
    {
      header: "Qty on hand",
      cell: (row: ItemValuationRow) => (
        <span className="tabular-nums">{row.quantityOnHand}</span>
      ),
    },
    {
      header: "Avg unit cost",
      cell: (row: ItemValuationRow) => formatCurrency(row.avgUnitCost),
    },
    {
      header: "Stock value",
      cell: (row: ItemValuationRow) => (
        <span className="font-medium">{formatCurrency(row.stockValue)}</span>
      ),
    },
    {
      header: "COGS to date",
      cell: (row: ItemValuationRow) => formatCurrency(row.cogsToDate),
    },
  ];

  // ── Movement history table columns ──────────────────────────────────────────

  const movementColumns = [
    {
      header: "Date",
      cell: (m: InventoryMovement) => formatDate(m.date),
    },
    {
      header: "Item",
      cell: (m: InventoryMovement) => m.itemName ?? String(m.itemId),
    },
    {
      header: "Type",
      cell: (m: InventoryMovement) => (
        <span className={typeColor(m.movementType)}>{capitalize(m.movementType)}</span>
      ),
    },
    {
      header: "Qty",
      cell: (m: InventoryMovement) => {
        // Sales are displayed as negative to signal outflow; all others as-is.
        const displayed = m.movementType === "sale" ? -Math.abs(m.quantity) : m.quantity;
        return <span className="tabular-nums">{displayed}</span>;
      },
    },
    {
      header: "Unit cost",
      cell: (m: InventoryMovement) => formatCurrency(m.unitCost),
    },
    {
      header: "Total",
      cell: (m: InventoryMovement) => formatCurrency(m.totalValue),
    },
    {
      header: "Reference / Notes",
      cell: (m: InventoryMovement) =>
        m.reference ? (
          <span>{m.reference}</span>
        ) : m.notes ? (
          <span className="text-muted-foreground text-xs">{m.notes}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <PageLayout
      title="Inventory Valuation"
      description="Weighted-average stock valuation and cost of goods sold, computed from the movement ledger."
      actionLabel="Record Movement"
      onAction={() => {
        setForm(EMPTY_FORM);
        setFormError(null);
        setFormOpen(true);
      }}
    >
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Stat
          title="Total Stock Value"
          value={formatCurrency(valuation?.totalStockValue ?? 0)}
          isLoading={isLoadingVal}
          icon={<Boxes className="h-4 w-4 text-muted-foreground" />}
        />
        <Stat
          title="Total COGS"
          value={formatCurrency(valuation?.totalCogs ?? 0)}
          isLoading={isLoadingVal}
          icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        />
      </div>

      {/* Valuation by item */}
      <Card>
        <CardHeader>
          <CardTitle>Valuation by item</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={valuationColumns}
            data={valuation?.rows ?? []}
            isLoading={isLoadingVal}
            emptyTitle="No tracked items"
            emptyDescription="Enable inventory tracking on an item to see it here."
          />
        </CardContent>
      </Card>

      {/* Movement history */}
      <Card>
        <CardHeader>
          <CardTitle>Movement history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={movementColumns}
            data={movements ?? []}
            isLoading={isLoadingMov}
            emptyTitle="No movements yet"
            emptyDescription="Record a purchase, sale, adjustment, or opening balance to start the ledger."
          />
        </CardContent>
      </Card>

      {/* Record Movement dialog */}
      <FormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormError(null);
        }}
        title="Record Movement"
        description="Add a purchase, sale, adjustment, or opening balance to the inventory ledger."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Record"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          {/* Item */}
          <div className="col-span-2 space-y-1.5">
            <Label>Item *</Label>
            <Select value={form.itemId} onValueChange={(v) => set("itemId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select tracked item" />
              </SelectTrigger>
              <SelectContent>
                {trackedItems.map((item: Item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                    {item.sku ? ` (${item.sku})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Movement type */}
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select
              value={form.movementType}
              onValueChange={(v) => set("movementType", v as MovementType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {capitalize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label>
              Quantity *
              {form.movementType === "adjustment" && (
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  (negative reduces stock)
                </span>
              )}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              placeholder={form.movementType === "adjustment" ? "e.g. -5 or 10" : "e.g. 100"}
            />
          </div>

          {/* Unit cost — shown only for purchase / opening / adjustment */}
          {showUnitCost(form.movementType) && (
            <div className="space-y-1.5">
              <Label>
                Unit cost
                {form.movementType === "purchase" || form.movementType === "opening"
                  ? " *"
                  : ""}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={form.unitCost}
                onChange={(e) => set("unitCost", e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input
              value={form.reference}
              onChange={(e) => set("reference", e.target.value)}
              placeholder="e.g. PO-1234"
            />
          </div>

          {/* Notes */}
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional notes"
            />
          </div>

          {/* Inline error */}
          {formError && (
            <div className="col-span-2 text-sm text-destructive">{formError}</div>
          )}
        </div>
      </FormDialog>
    </PageLayout>
  );
}

export default InventoryValuationPage;
