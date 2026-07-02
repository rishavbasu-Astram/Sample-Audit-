import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useListBankAccounts,
  useListBankTransactions,
  useListStatementLines,
  useImportStatement,
  useMatchStatementLine,
  useUnmatchStatementLine,
  useDeleteStatementLine,
  useAutoMatchStatementLines,
  useReconcileAccount,
  useGetReconciliationSummary,
  getListStatementLinesQueryKey,
  getGetReconciliationSummaryQueryKey,
  getListBankAccountsQueryKey,
  getListBankTransactionsQueryKey,
} from "@workspace/api-client-react";
import type {
  StatementLine,
  BankAccount,
  BankTransaction,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Landmark, Wand2, CheckCheck, Undo2, Trash2, Lock } from "lucide-react";

// ── Match Dialog ──────────────────────────────────────────────────────────────

function MatchDialog({
  open,
  onClose,
  line,
  accountId,
  onMatch,
  isMatching,
}: {
  open: boolean;
  onClose: () => void;
  line: StatementLine | null;
  accountId: number;
  onMatch: (lineId: number, transactionId: number) => void;
  isMatching: boolean;
}) {
  const { data: txns, isLoading } = useListBankTransactions(
    { accountId },
    { query: { enabled: open, queryKey: getListBankTransactionsQueryKey({ accountId }) } }
  );

  if (!line) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Match Statement Line</DialogTitle>
          <DialogDescription>
            Select a ledger transaction to match with:{" "}
            <span className="font-medium">{line.description}</span> —{" "}
            {formatCurrency(line.amount)} ({line.type}) on {formatDate(line.date)}
          </DialogDescription>
        </DialogHeader>
        <DataTable<BankTransaction>
          columns={[
            { header: "Date", cell: (t) => formatDate(t.date) },
            {
              header: "Description",
              cell: (t) => (
                <div>
                  <div>{t.description}</div>
                  {t.reference && (
                    <div className="text-xs text-muted-foreground">{t.reference}</div>
                  )}
                </div>
              ),
            },
            { header: "Type", cell: (t) => <span className="capitalize">{t.type}</span> },
            { header: "Amount", cell: (t) => formatCurrency(t.amount) },
            {
              header: "",
              cell: (t) => (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isMatching}
                  onClick={() => onMatch(line.id, t.id)}
                >
                  Select
                </Button>
              ),
            },
          ]}
          data={txns}
          isLoading={isLoading}
          emptyTitle="No transactions"
          emptyDescription="No bank transactions found for this account."
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Import Dialog ─────────────────────────────────────────────────────────────

function parseCSV(
  raw: string
): { lines: Array<{ date: string; description: string; amount: number; type: string; reference?: string }>; errors: string[] } {
  const errors: string[] = [];
  const lines: Array<{ date: string; description: string; amount: number; type: string; reference?: string }> = [];

  const rows = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (let i = 0; i < rows.length; i++) {
    const parts = rows[i].split(",").map((p) => p.trim());
    if (parts.length < 4) {
      errors.push(`Row ${i + 1}: expected at least 4 columns (date, description, amount, type)`);
      continue;
    }
    const [date, description, amountStr, type, reference] = parts;
    const amount = parseFloat(amountStr);
    if (!date) { errors.push(`Row ${i + 1}: date is required`); continue; }
    if (!description) { errors.push(`Row ${i + 1}: description is required`); continue; }
    if (isNaN(amount) || amount <= 0) { errors.push(`Row ${i + 1}: amount must be a positive number`); continue; }
    if (!["debit", "credit"].includes(type)) { errors.push(`Row ${i + 1}: type must be 'debit' or 'credit'`); continue; }
    lines.push({ date, description, amount, type, ...(reference ? { reference } : {}) });
  }

  return { lines, errors };
}

function ImportDialog({
  open,
  onOpenChange,
  accountId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const importMutation = useImportStatement({
    mutation: {
      onSuccess: () => {
        setCsv("");
        setParseErrors([]);
        onOpenChange(false);
        onImported();
      },
    },
  });

  function handleSubmit() {
    const { lines, errors } = parseCSV(csv);
    if (errors.length > 0) {
      setParseErrors(errors);
      return;
    }
    if (lines.length === 0) {
      setParseErrors(["No valid lines found"]);
      return;
    }
    setParseErrors([]);
    importMutation.mutate({ data: { accountId, lines } });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { setCsv(""); setParseErrors([]); }
        onOpenChange(o);
      }}
      title="Import Statement"
      description="Paste CSV rows — one line per row."
      onSubmit={handleSubmit}
      isSubmitting={importMutation.isPending}
      submitLabel="Import"
      size="lg"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>CSV rows</Label>
          <Textarea
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"one line per row: date,description,amount,type[,reference]\ne.g. 2026-06-12,AWS invoice,50000,debit"}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Format: date (YYYY-MM-DD), description, amount, type (debit or credit), reference (optional)
          </p>
        </div>
        {parseErrors.length > 0 && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-3">
            <p className="mb-1 text-xs font-medium text-destructive">Fix these errors before importing:</p>
            <ul className="list-inside list-disc space-y-0.5">
              {parseErrors.map((e, i) => (
                <li key={i} className="text-xs text-destructive">{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FormDialog>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ accountId }: { accountId: number }) {
  const { data: summary, isLoading } = useGetReconciliationSummary(accountId, {
    query: { queryKey: getGetReconciliationSummaryQueryKey(accountId) },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Landmark className="h-4 w-4" /> Ledger Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(summary.ledgerBalance)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Unmatched</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{summary.unmatched}</p>
          <p className="text-xs text-muted-foreground">
            net {summary.unmatchedNet >= 0 ? "+" : ""}{formatCurrency(summary.unmatchedNet)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Matched</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{summary.matched}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Reconciled</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{summary.reconciled}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ReconciliationPage() {
  const qc = useQueryClient();

  const { data: accounts, isLoading: accountsLoading } = useListBankAccounts();

  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const accountId = selectedAccountId ?? (accounts?.[0]?.id ?? null);

  // Once accounts load, default to first
  if (!selectedAccountId && accounts && accounts.length > 0 && accountId === accounts[0].id) {
    // accountId is already defaulting to first via the expression above
  }

  const [importOpen, setImportOpen] = useState(false);
  const [matchingLine, setMatchingLine] = useState<StatementLine | null>(null);
  const [deletingLine, setDeletingLine] = useState<StatementLine | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  const linesParams = accountId ? { accountId } : undefined;
  const { data: lines, isLoading: linesLoading } = useListStatementLines(linesParams, {
    query: { queryKey: getListStatementLinesQueryKey(linesParams) },
  });

  const { data: summary } = useGetReconciliationSummary(accountId ?? 0, {
    query: { enabled: !!accountId, queryKey: getGetReconciliationSummaryQueryKey(accountId ?? 0) },
  });

  function invalidateAll() {
    if (!accountId) return;
    qc.invalidateQueries({ queryKey: getListStatementLinesQueryKey(linesParams) });
    qc.invalidateQueries({ queryKey: getGetReconciliationSummaryQueryKey(accountId) });
    qc.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
  }

  const autoMatchMutation = useAutoMatchStatementLines({
    mutation: { onSuccess: invalidateAll },
  });

  const reconcileMutation = useReconcileAccount({
    mutation: { onSuccess: () => { invalidateAll(); setReconcileOpen(false); } },
  });

  const matchMutation = useMatchStatementLine({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setMatchingLine(null);
      },
    },
  });

  const unmatchMutation = useUnmatchStatementLine({
    mutation: { onSuccess: invalidateAll },
  });

  const deleteMutation = useDeleteStatementLine({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setDeletingLine(null);
      },
    },
  });

  const lineColumns = [
    { header: "Date", cell: (l: StatementLine) => formatDate(l.date) },
    {
      header: "Description",
      cell: (l: StatementLine) => (
        <div>
          <div>{l.description}</div>
          {l.reference && (
            <div className="text-xs text-muted-foreground">{l.reference}</div>
          )}
        </div>
      ),
    },
    {
      header: "Type",
      cell: (l: StatementLine) => <span className="capitalize">{l.type}</span>,
    },
    {
      header: "Amount",
      cell: (l: StatementLine) => (
        <span className={l.type === "debit" ? "text-destructive" : undefined}>
          {l.type === "debit" ? "-" : ""}
          {formatCurrency(l.amount)}
        </span>
      ),
    },
    {
      header: "Status",
      cell: (l: StatementLine) => <StatusBadge status={l.status} />,
    },
    {
      header: "Matched To",
      cell: (l: StatementLine) =>
        l.matchedTransactionDescription ? (
          <span className="text-sm">{l.matchedTransactionDescription}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "",
      cell: (l: StatementLine) => {
        if (l.status === "reconciled") {
          return <Lock className="h-4 w-4 text-muted-foreground" />;
        }
        if (l.status === "matched") {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground"
              title="Unmatch"
              onClick={() => unmatchMutation.mutate({ id: l.id })}
              disabled={unmatchMutation.isPending}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          );
        }
        // unmatched
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMatchingLine(l)}
            >
              Match
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title="Delete"
              onClick={() => setDeletingLine(l)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <PageLayout
      title="Reconciliation"
      description="Import bank statements and match them to ledger transactions to keep your books accurate."
      actionLabel="Import Statement"
      onAction={() => setImportOpen(true)}
    >
      {/* Account select */}
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium">Account</label>
        {accountsLoading ? (
          <div className="h-9 w-48 animate-pulse rounded bg-muted" />
        ) : (
          <Select
            value={accountId ? String(accountId) : ""}
            onValueChange={(v) => setSelectedAccountId(parseInt(v, 10))}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts?.map((a: BankAccount) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary cards */}
      {accountId && (
        <div className="mb-6">
          <SummaryCards accountId={accountId} />
        </div>
      )}

      {/* Action buttons */}
      {accountId && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => autoMatchMutation.mutate({ id: accountId })}
            disabled={autoMatchMutation.isPending}
          >
            <Wand2 className="mr-2 h-4 w-4" />
            {autoMatchMutation.isPending ? "Matching…" : "Auto-match"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setReconcileOpen(true)}
            disabled={reconcileMutation.isPending}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Reconcile matched
          </Button>
          {autoMatchMutation.data && (
            <span className="text-sm text-muted-foreground">
              Auto-match found {autoMatchMutation.data.matched} match{autoMatchMutation.data.matched === 1 ? "" : "es"}.
            </span>
          )}
          {reconcileMutation.data && (
            <span className="text-sm text-muted-foreground">
              Reconciled {reconcileMutation.data.reconciled} line{reconcileMutation.data.reconciled === 1 ? "" : "s"}.
            </span>
          )}
        </div>
      )}

      {/* Statement lines table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statement lines</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable<StatementLine>
            columns={lineColumns}
            data={lines}
            isLoading={linesLoading}
            emptyTitle="No statement lines"
            emptyDescription="Import a bank statement to get started."
          />
        </CardContent>
      </Card>

      {/* Import dialog */}
      {accountId && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          accountId={accountId}
          onImported={invalidateAll}
        />
      )}

      {/* Match dialog */}
      {accountId && (
        <MatchDialog
          open={!!matchingLine}
          onClose={() => setMatchingLine(null)}
          line={matchingLine}
          accountId={accountId}
          onMatch={(lineId, transactionId) =>
            matchMutation.mutate({ id: lineId, data: { transactionId } })
          }
          isMatching={matchMutation.isPending}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deletingLine}
        onOpenChange={(o) => !o && setDeletingLine(null)}
        title="Delete Statement Line"
        description={`Delete line "${deletingLine?.description}"? This cannot be undone.`}
        onConfirm={() => deletingLine && deleteMutation.mutate({ id: deletingLine.id })}
        isLoading={deleteMutation.isPending}
      />

      {/* Reconcile confirm */}
      <ConfirmDialog
        open={reconcileOpen}
        onOpenChange={(o) => !o && setReconcileOpen(false)}
        title="Reconcile Matched Lines"
        description={`This will lock in ${summary?.matched ?? 0} matched line${summary?.matched === 1 ? "" : "s"} as reconciled. Reconciled lines cannot be unmatched or deleted.`}
        onConfirm={() => accountId && reconcileMutation.mutate({ id: accountId })}
        isLoading={reconcileMutation.isPending}
        confirmLabel="Reconcile"
      />
    </PageLayout>
  );
}

export default ReconciliationPage;
