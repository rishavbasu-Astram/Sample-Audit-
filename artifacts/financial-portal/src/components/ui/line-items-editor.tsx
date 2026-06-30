import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

export interface LineItemRow {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

export function emptyLineItem(): LineItemRow {
  return { description: "", quantity: 1, unitPrice: 0, taxRate: 0, amount: 0 };
}

interface LineItemsEditorProps {
  items: LineItemRow[];
  onChange: (items: LineItemRow[]) => void;
}

function recalc(item: LineItemRow): LineItemRow {
  return { ...item, amount: parseFloat((item.quantity * item.unitPrice).toFixed(2)) };
}

export function LineItemsEditor({ items, onChange }: LineItemsEditorProps) {
  function add() {
    onChange([...items, emptyLineItem()]);
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof LineItemRow, raw: string) {
    onChange(
      items.map((item, idx) => {
        if (idx !== i) return item;
        const updated = { ...item, [field]: field === "description" ? raw : parseFloat(raw) || 0 };
        return field !== "description" ? recalc(updated) : updated;
      })
    );
  }

  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const taxTotal = items.reduce((s, it) => s + it.amount * (it.taxRate / 100), 0);
  const total = subtotal + taxTotal;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_64px_96px_64px_80px_32px] gap-1 text-xs font-semibold text-muted-foreground px-0.5 pb-1">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit Price</span>
        <span>Tax %</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3 border rounded-md bg-muted/30">
          No line items — click Add to begin.
        </p>
      )}

      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_64px_96px_64px_80px_32px] gap-1 items-center">
          <Input
            value={item.description}
            onChange={(e) => update(i, "description", e.target.value)}
            placeholder="Description"
            className="h-8 text-sm"
          />
          <Input
            type="number"
            min={0}
            value={item.quantity}
            onChange={(e) => update(i, "quantity", e.target.value)}
            className="h-8 text-sm"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={item.unitPrice}
            onChange={(e) => update(i, "unitPrice", e.target.value)}
            className="h-8 text-sm"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={item.taxRate}
            onChange={(e) => update(i, "taxRate", e.target.value)}
            className="h-8 text-sm"
          />
          <span className="text-sm text-right font-medium pr-1">
            ${item.amount.toFixed(2)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => remove(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        className="w-full h-8 text-xs mt-1"
      >
        <Plus className="h-3 w-3 mr-1" /> Add Line Item
      </Button>

      <div className="flex justify-end gap-6 text-sm pt-2 border-t">
        <span className="text-muted-foreground">
          Subtotal: <span className="text-foreground font-medium">${subtotal.toFixed(2)}</span>
        </span>
        <span className="text-muted-foreground">
          Tax: <span className="text-foreground font-medium">${taxTotal.toFixed(2)}</span>
        </span>
        <span className="text-muted-foreground font-semibold">
          Total: <span className="text-foreground">${total.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}
