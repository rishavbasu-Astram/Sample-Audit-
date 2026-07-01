import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";

import { Dashboard } from "@/pages/dashboard";
import { AssetsPage } from "@/pages/assets";
import { CustomersPage } from "@/pages/sales/customers";
import { QuotesPage } from "@/pages/sales/quotes";
import { SalesOrdersPage } from "@/pages/sales/sales-orders";
import { InvoicesPage } from "@/pages/sales/invoices";
import { SalesReceiptsPage } from "@/pages/sales/sales-receipts";
import { RecurringInvoicesPage } from "@/pages/sales/recurring-invoices";
import { PaymentLinksPage } from "@/pages/sales/payment-links";
import { PaymentsReceivedPage } from "@/pages/sales/payments-received";
import { CreditNotesPage } from "@/pages/sales/credit-notes";

import { VendorsPage } from "@/pages/purchases/vendors";
import { ExpensesPage } from "@/pages/purchases/expenses";
import { RecurringExpensesPage } from "@/pages/purchases/recurring-expenses";
import { PurchaseOrdersPage } from "@/pages/purchases/purchase-orders";
import { BillsPage } from "@/pages/purchases/bills";
import { RecurringBillsPage } from "@/pages/purchases/recurring-bills";
import { PaymentsMadePage } from "@/pages/purchases/payments-made";
import { VendorCreditsPage } from "@/pages/purchases/vendor-credits";

import { BankingPage } from "@/pages/banking";

import { JournalsPage } from "@/pages/accountant/journals";
import { ChartOfAccountsPage } from "@/pages/accountant/chart-of-accounts";
import { BudgetsPage } from "@/pages/accountant/budgets";
import { VatPaymentsPage } from "@/pages/accountant/vat-payments";
import { CurrencyAdjustmentsPage } from "@/pages/accountant/currency-adjustments";
import { TransactionLockingPage } from "@/pages/accountant/transaction-locking";

import { CostCentersPage } from "@/pages/controlling/cost-centers";
import { ProductCostsPage } from "@/pages/controlling/product-costs";
import { ProfitabilityPage } from "@/pages/controlling/profitability";

import { AuditLedgerPage } from "@/pages/audit/ledger";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function FallbackPage({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <p className="text-muted-foreground">This page is under construction.</p>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        
        {/* Assets */}
        <Route path="/assets" component={AssetsPage} />
        
        {/* Sales */}
        <Route path="/sales/customers" component={CustomersPage} />
        <Route path="/sales/quotes" component={QuotesPage} />
        <Route path="/sales/sales-orders" component={SalesOrdersPage} />
        <Route path="/sales/invoices" component={InvoicesPage} />
        <Route path="/sales/sales-receipts" component={SalesReceiptsPage} />
        <Route path="/sales/recurring-invoices" component={RecurringInvoicesPage} />
        <Route path="/sales/payment-links" component={PaymentLinksPage} />
        <Route path="/sales/payments-received" component={PaymentsReceivedPage} />
        <Route path="/sales/credit-notes" component={CreditNotesPage} />
        
        {/* Purchases */}
        <Route path="/purchases/vendors" component={VendorsPage} />
        <Route path="/purchases/expenses" component={ExpensesPage} />
        <Route path="/purchases/recurring-expenses" component={RecurringExpensesPage} />
        <Route path="/purchases/purchase-orders" component={PurchaseOrdersPage} />
        <Route path="/purchases/bills" component={BillsPage} />
        <Route path="/purchases/recurring-bills" component={RecurringBillsPage} />
        <Route path="/purchases/payments-made" component={PaymentsMadePage} />
        <Route path="/purchases/vendor-credits" component={VendorCreditsPage} />
        
        {/* Banking */}
        <Route path="/banking" component={BankingPage} />
        
        {/* Accountant */}
        <Route path="/accountant/journals" component={JournalsPage} />
        <Route path="/accountant/chart-of-accounts" component={ChartOfAccountsPage} />
        <Route path="/accountant/budgets" component={BudgetsPage} />
        <Route path="/accountant/vat-payments" component={VatPaymentsPage} />
        <Route path="/accountant/currency-adjustments" component={CurrencyAdjustmentsPage} />
        <Route path="/accountant/transaction-locking" component={TransactionLockingPage} />

        {/* Controlling */}
        <Route path="/controlling/cost-centers" component={CostCentersPage} />
        <Route path="/controlling/product-costs" component={ProductCostsPage} />
        <Route path="/controlling/profitability" component={ProfitabilityPage} />

        {/* Security */}
        <Route path="/audit/ledger" component={AuditLedgerPage} />

        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
