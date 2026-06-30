import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListBankAccounts,
  useListBankTransactions,
  useCreateBankAccount,
  useCreateBankTransaction,
  getListBankAccountsQueryKey,
  getListBankTransactionsQueryKey,
} from "@workspace/api-client-react";
import type {
  BankAccount,
  BankTransaction,
  BankAccountInput,
  BankTransactionInput,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Building2, Plus } from "lucide-react";

const ACCOUNT_TYPES = ["Checking", "Savings", "Credit Card", "Cash", "Other"];
const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "JPY", "CAD", "AUD"];

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_ACCOUNT: BankAccountInput = {
  name: "",
  accountNumber: "",
  bankName: "",
  accountType: "Checking",
  currency: "USD",
  currentBalance: 0,
};

export function BankingPage() {
  const qc = useQueryClient();
  const { data: accounts, isLoading: isLoadingAccounts } = useListBankAccounts();
  const { data: transactions, isLoading: isLoadingTransactions } = useListBankTransactions();

  // Account form state
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<BankAccountInput>(EMPTY_ACCOUNT);

  // Transaction form state
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [txDate, setTxDate] = useState(today());
  const [txType, setTxType] = useState("credit");
  const [txAmount, setTxAmount] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txReference, setTxReference] = useState("");

  const createAccountMutation = useCreateBankAccount({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
        setAccountFormOpen(false);
      },
    },
  });

  const createTxMutation = useCreateBankTransaction({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBankTransactionsQueryKey() });
        qc.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
        setTxFormOpen(false);
      },
    },
  });

  function setAccountField(field: keyof BankAccountInput, value: string | number) {
    setAccountForm((f) => ({ ...f, [field]: value }));
  }

  function handleCreateAccount() {
    if (!accountForm.name.trim()) return;
    createAccountMutation.mutate({
      data: { ...accountForm, currentBalance: Number(accountForm.currentBalance) },
    });
  }

  function openTxForm(accountId?: number) {
    setSelectedAccountId(accountId ? String(accountId) : "");
    setTxDate(today());
    setTxType("credit");
    setTxAmount("");
    setTxDescription("");
    setTxReference("");
    setTxFormOpen(true);
  }

  function handleCreateTransaction() {
    if (!selectedAccountId || !txAmount || !txDescription) return;
    const payload: BankTransactionInput = {
      accountId: parseInt(selectedAccountId, 10),
      date: txDate,
      type: txType,
      amount: parseFloat(txAmount),
      description: txDescription,
      reference: txReference || undefined,
    };
    createTxMutation.mutate({ data: payload });
  }

  const txColumns = [
    { header: "Date", cell: (item: BankTransaction) => formatDate(item.date) },
    { header: "Description", accessorKey: "description" as const },
    {
      header: "Reference",
      cell: (item: BankTransaction) =>
        item.reference || <span className="text-muted-foreground">—</span>,
    },
    {
      header: "Amount",
      cell: (item: BankTransaction) => (
        <span className={`font-medium ${item.type === "debit" ? "text-red-600" : "text-green-600"}`}>
          {item.type === "debit" ? "−" : "+"}{formatCurrency(item.amount)}
        </span>
      ),
    },
    {
      header: "Balance",
      cell: (item: BankTransaction) => <span className="font-medium">{formatCurrency(item.balance)}</span>,
    },
  ];

  return (
    <PageLayout
      title="Banking"
      description="Manage bank accounts and track transactions."
      actionLabel="Add Account"
      onAction={() => { setAccountForm(EMPTY_ACCOUNT); setAccountFormOpen(true); }}
    >
      {/* Bank accounts grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {isLoadingAccounts ? (
          <>
            <Skeleton className="h-[120px] rounded-xl" />
            <Skeleton className="h-[120px] rounded-xl" />
          </>
        ) : accounts && accounts.length > 0 ? (
          accounts.map((account) => (
            <Card
              key={account.id}
              className={`relative ${account.isActive ? "border-primary/20 bg-primary/5" : "opacity-60"}`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{account.name}</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(account.currentBalance, account.currency)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {account.bankName || account.accountType}
                  {account.accountNumber ? ` • ...${account.accountNumber.slice(-4)}` : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs w-full"
                  onClick={() => openTxForm(account.id)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Transaction
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-3 text-center py-10 text-muted-foreground text-sm border rounded-xl bg-muted/20">
            No bank accounts yet. Click "Add Account" to get started.
          </div>
        )}
      </div>

      {/* Transactions table */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <Button variant="outline" size="sm" onClick={() => openTxForm()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Record Transaction
        </Button>
      </div>
      <DataTable
        columns={txColumns}
        data={transactions}
        isLoading={isLoadingTransactions}
        emptyTitle="No transactions"
        emptyDescription="Add a transaction to see it recorded here."
      />

      {/* Add Account dialog */}
      <FormDialog
        open={accountFormOpen}
        onOpenChange={setAccountFormOpen}
        title="Add Bank Account"
        description="Register a bank account to track its balance and transactions."
        onSubmit={handleCreateAccount}
        isSubmitting={createAccountMutation.isPending}
        submitLabel="Add Account"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Account Name *</Label>
            <Input
              value={accountForm.name}
              onChange={(e) => setAccountField("name", e.target.value)}
              placeholder="e.g. Main Checking Account"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bank Name</Label>
            <Input
              value={accountForm.bankName ?? ""}
              onChange={(e) => setAccountField("bankName", e.target.value)}
              placeholder="e.g. Chase, Wells Fargo"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input
              value={accountForm.accountNumber ?? ""}
              onChange={(e) => setAccountField("accountNumber", e.target.value)}
              placeholder="Last 4 digits or full number"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Type</Label>
            <Select value={accountForm.accountType} onValueChange={(v) => setAccountField("accountType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={accountForm.currency} onValueChange={(v) => setAccountField("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Opening Balance</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={accountForm.currentBalance}
              onChange={(e) => setAccountField("currentBalance", e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      </FormDialog>

      {/* Add Transaction dialog */}
      <FormDialog
        open={txFormOpen}
        onOpenChange={setTxFormOpen}
        title="Record Transaction"
        description="Record a debit or credit against a bank account."
        onSubmit={handleCreateTransaction}
        isSubmitting={createTxMutation.isPending}
        submitLabel="Record"
        size="md"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Account *</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                    {a.bankName ? ` — ${a.bankName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={txType} onValueChange={setTxType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Credit (money in)</SelectItem>
                <SelectItem value="debit">Debit (money out)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input
              value={txReference}
              onChange={(e) => setTxReference(e.target.value)}
              placeholder="Check #, transfer ID…"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Description *</Label>
            <Input
              value={txDescription}
              onChange={(e) => setTxDescription(e.target.value)}
              placeholder="What was this transaction for?"
            />
          </div>
        </div>
      </FormDialog>
    </PageLayout>
  );
}
