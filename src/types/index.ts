// ============================================================
// ENTERPRISE FINANCIAL MANAGEMENT SYSTEM - TYPE DEFINITIONS
// ============================================================
// Strict TypeScript types enforcing domain constraints
// Based on technical architecture document requirements

// ------------------- AUTH & RBAC -------------------

export type UserRole = 'super_admin' | 'cfo' | 'accountant' | 'auditor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mfaEnabled: boolean;
  lastLogin: Date;
  department: string;
  permissions: Permission[];
}

export type Permission = 
  | 'dashboard:read'
  | 'cashflow:read' | 'cashflow:write'
  | 'invoices:read' | 'invoices:write' | 'invoices:delete'
  | 'ledger:read' | 'ledger:write' | 'ledger:approve'
  | 'audit:read'
  | 'reports:read' | 'reports:export'
  | 'users:manage';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  mfaRequired: boolean;
  sessionExpiry: Date | null;
}

// ------------------- CASH FLOW -------------------

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD';

export interface CashAccount {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  currency: CurrencyCode;
  balance: number;
  type: 'checking' | 'savings' | 'credit' | 'investment';
  lastReconciled: Date;
}

export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'pending' | 'cleared' | 'reconciled';

export interface CashTransaction {
  id: string;
  accountId: string;
  date: Date;
  description: string;
  amount: number;
  currency: CurrencyCode;
  type: TransactionType;
  status: TransactionStatus;
  category: string;
  reference: string;
  counterparty: string;
}

export interface CashFlowForecast {
  date: Date;
  projectedInflow: number;
  projectedOutflow: number;
  netPosition: number;
  confidence: number; // 0-1
}

// ------------------- INVOICING -------------------

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
export type InvoiceType = 'standard' | 'recurring' | 'credit_note';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  clientName: string;
  clientEmail: string;
  issueDate: Date;
  dueDate: Date;
  currency: CurrencyCode;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes: string;
  recurringSchedule?: RecurringSchedule;
}

export interface RecurringSchedule {
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: Date;
  endDate?: Date;
  maxOccurrences?: number;
  nextInvoiceDate: Date;
}

// ------------------- GENERAL LEDGER -------------------

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type AccountCategory = 
  | 'current_asset' | 'fixed_asset' | 'intangible_asset'
  | 'current_liability' | 'long_term_liability'
  | 'equity'
  | 'operating_revenue' | 'other_revenue'
  | 'operating_expense' | 'cost_of_goods_sold' | 'other_expense';

export interface ChartOfAccount {
  id: string;
  code: string; // e.g., "1000", "2100"
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentId?: string;
  balance: number;
  isActive: boolean;
  description: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: Date;
  description: string;
  reference: string;
  lines: JournalLine[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  status: 'draft' | 'posted' | 'reversed';
  postedBy?: string;
  postedAt?: Date;
  attachments: string[];
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountName: string;
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
}

// ------------------- FINANCIAL STATEMENTS -------------------

export interface ProfitLossStatement {
  periodStart: Date;
  periodEnd: Date;
  revenue: {
    operating: number;
    other: number;
    total: number;
  };
  expenses: {
    cogs: number;
    operating: number;
    other: number;
    total: number;
  };
  netIncome: number;
  grossProfit: number;
  operatingIncome: number;
  ebitda: number;
}

export interface BalanceSheet {
  asOfDate: Date;
  assets: {
    current: { name: string; amount: number }[];
    fixed: { name: string; amount: number }[];
    intangible: { name: string; amount: number }[];
    total: number;
  };
  liabilities: {
    current: { name: string; amount: number }[];
    longTerm: { name: string; amount: number }[];
    total: number;
  };
  equity: {
    items: { name: string; amount: number }[];
    total: number;
  };
  totalLiabilitiesAndEquity: number;
}

export interface CashFlowStatement {
  periodStart: Date;
  periodEnd: Date;
  operating: {
    items: { description: string; amount: number }[];
    net: number;
  };
  investing: {
    items: { description: string; amount: number }[];
    net: number;
  };
  financing: {
    items: { description: string; amount: number }[];
    net: number;
  };
  netIncrease: number;
  beginningCash: number;
  endingCash: number;
}

// ------------------- AUDIT & COMPLIANCE -------------------

export type AuditAction = 
  | 'CREATE' | 'READ' | 'UPDATE' | 'DELETE'
  | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'APPROVE'
  | 'REJECT' | 'POST' | 'REVERSE';

export type AuditEntity = 
  | 'user' | 'invoice' | 'transaction' | 'journal_entry'
  | 'account' | 'report' | 'setting' | 'document';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  description: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  hash: string; // Cryptographic hash for integrity
}

export interface ComplianceControl {
  id: string;
  framework: 'SOC2' | 'GDPR' | 'PCI-DSS';
  controlId: string;
  title: string;
  description: string;
  status: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable';
  lastAssessed: Date;
  nextAssessment: Date;
  evidence: string[];
  owner: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DocumentVaultItem {
  id: string;
  name: string;
  type: 'invoice' | 'receipt' | 'contract' | 'report' | 'tax_document' | 'other';
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  version: number;
  tags: string[];
  encrypted: boolean;
  retentionDate: Date;
  checksum: string;
}

// ------------------- REPORTING -------------------

export interface DashboardWidget {
  id: string;
  type: 'kpi' | 'chart' | 'table' | 'alert';
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, unknown>;
}

export interface BudgetVariance {
  accountId: string;
  accountName: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: 'favorable' | 'unfavorable' | 'on_track';
}

export interface FinancialKPI {
  name: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'neutral';
  target?: number;
  unit: 'currency' | 'percentage' | 'ratio' | 'count';
}

// ------------------- API RESPONSES -------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DateRange {
  from: Date;
  to: Date;
}
