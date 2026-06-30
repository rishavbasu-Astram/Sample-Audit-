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
  useListJournals,
  useCreateJournal,
  useDeleteJournal,
  useListChartOfAccounts,
  getListJournalsQueryKey,
} from "@workspace/api-client-react";
import type { Journal, JournalInput, JournalEntry } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { Plus, Trash2, AlertCircle } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

type EntryRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  description: string;
};

function emptyEntry(): EntryRow {
  return { accountId: "", accountCode: "", accountName: "", debit: "", credit: "", description: "" };
}

function JournalEntryEditor({
  entries,
  onChange,
  accounts,
}: {
  entries: EntryRow[];
  onChange: (e: EntryRow[]) => void;
  accounts: { id: number; code: string; name: string }[];
}) {
  function add() {
    onChange([...entries, emptyEntry()]);
  }
  function remove(i: number) {
    onChange(entries.filter((_, idx) => idx !== i));
  }
  function updateAccount(i: number, accountId: string) {
    const acct = accounts.find((a) => String(a.id) === accountId);
    onChange(
      entries.map((e, idx) =>
        idx !== i
          ? e
          : { ...e, accountId, accountCode: acct?.code ?? "", accountName: acct?.name ?? "" }
      )
    );
  }
  function updateField(i: number, field: "debit" | "credit" | "description", val: string) {
    onChange(
      entries.map((e, idx) => {
        if (idx !== i) return e;
        const updated = { ...e, [field]: val };
        if (field === "debit" && val) updated.credit = "";
        if (field === "credit" && val) updated.debit = "";
        return updated;
      })
    );
  }

  const totalDebits = entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalCredits = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_90px_90px_130px_28px] gap-1 text-xs font-semibold text-muted-foreground px-0.5 pb-1">
        <span>Account</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
        <span>Description</span>
        <span />
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3 border rounded-md bg-muted/30">
          No entries — click Add Line to begin.
        </p>
      )}

      {entries.map((entry, i) => (
        <div key={i} className="grid grid-cols-[1fr_90px_90px_130px_28px] gap-1 items-center">
          <Select value={entry.accountId} onValueChange={(v) => updateAccount(i, v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.code} — {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={entry.debit}
            onChange={(e) => updateField(i, "debit", e.target.value)}
            placeholder="0.00"
            className="h-8 text-sm text-right"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={entry.credit}
            onChange={(e) => updateField(i, "credit", e.target.value)}
            placeholder="0.00"
            className="h-8 text-sm text-right"
          />
          <Input
            value={entry.description}
            onChange={(e) => updateField(i, "description", e.target.value)}
            placeholder="Note"
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => remove(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full h-8 text-xs mt-1">
        <Plus className="h-3 w-3 mr-1" /> Add Line
      </Button>

      <div className={`flex items-center justify-between text-sm pt-2 border-t ${!isBalanced && entries.length > 0 ? "border-red-200" : ""}`}>
        <div className="flex gap-6">
          <span className="text-muted-foreground">
            Debits: <span className="text-foreground font-medium">${totalDebits.toFixed(2)}</span>
          </span>
          <span className="text-muted-foreground">
            Credits: <span className="text-foreground font-medium">${totalCredits.toFixed(2)}</span>
          </span>
        </div>
        {entries.length > 0 && !isBalanced && (
          <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5" /> Not balanced
          </span>
        )}
        {entries.length > 0 && isBalanced && (
          <span className="text-green-600 text-xs font-medium">Balanced</span>
        )}
      </div>
    </div>
  );
}

export function JournalsPage() {
  const qc = useQueryClient();
  const { data: journals, isLoading } = useListJournals();
  const { data: accounts } = useListChartOfAccounts();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Journal | null>(null);

  const [type, setType] = useState<"manual" | "recurring">("manual");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([emptyEntry(), emptyEntry()]);

  const createMutation = useCreateJournal({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListJournalsQueryKey() });
        setFormOpen(false);
      },
    },
  });
  const deleteMutation = useDeleteJournal({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListJournalsQueryKey() });
        setDeleteOpen(false);
      },
    },
  });

  function openCreate() {
    setType("manual");
    setDate(today());
    setReference("");
    setNotes("");
    setEntries([emptyEntry(), emptyEntry()]);
    setFormOpen(true);
  }

  const totalDebits = entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalCredits = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0;

  function handleSubmit() {
    if (!isBalanced || entries.some((e) => !e.accountId)) return;
    const journalEntries: JournalEntry[] = entries.map((e) => ({
      accountId: parseInt(e.accountId, 10),
      accountCode: e.accountCode,
      accountName: e.accountName,
      debit: parseFloat(e.debit) || 0,
      credit: parseFloat(e.credit) || 0,
      description: e.description || null,
    }));
    const payload: JournalInput = {
      type,
      date,
      reference: reference || undefined,
      notes: notes || undefined,
      entries: journalEntries,
    };
    createMutation.mutate({ data: payload });
  }

  const acctList = (accounts ?? []).map((a) => ({ id: a.id, code: a.code, name: a.name }));

  const columns = [
    { header: "Journal #", accessorKey: "journalNumber" as const },
    {
      header: "Type",
      cell: (item: Journal) => <span className="capitalize">{item.type}</span>,
    },
    { header: "Date", cell: (item: Journal) => formatDate(item.date) },
    {
      header: "Reference",
      cell: (item: Journal) =>
        item.reference || <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Lines",
      cell: (item: Journal) => (
        <span className="text-muted-foreground text-sm">{item.entries.length} entries</span>
      ),
    },
    { header: "Status", cell: (item: Journal) => <StatusBadge status={item.status} /> },
    {
      header: "",
      cell: (item: Journal) => (
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
      title="Journals"
      description="Manage manual and recurring journal entries."
      actionLabel="Create Journal"
      onAction={openCreate}
    >
      <DataTable
        columns={columns}
        data={journals}
        isLoading={isLoading}
        emptyTitle="No journal entries"
        emptyDescription="Create manual journal entries to adjust accounts."
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Create Journal Entry"
        description="Enter balanced debit and credit lines. Total debits must equal total credits."
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel={isBalanced ? "Post Journal" : "Post Journal (unbalanced)"}
        size="xl"
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "manual" | "recurring")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional ref #" />
          </div>
          <div className="col-span-3 space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Purpose of this journal entry" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Journal Lines *</Label>
          <JournalEntryEditor entries={entries} onChange={setEntries} accounts={acctList} />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Journal Entry"
        description={`Are you sure you want to delete journal "${deleting?.journalNumber}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        isLoading={deleteMutation.isPending}
      />
    </PageLayout>
  );
}
