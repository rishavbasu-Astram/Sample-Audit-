"use client";

// ============================================================
// MOCK DATA LAYER - Simulating PostgreSQL + NestJS Backend
// ============================================================
// This module provides realistic seed data for all functional areas
// In production, these would be fetched from microservices via API Gateway

import {
  User, CashAccount, CashTransaction, Invoice,
  ChartOfAccount, JournalEntry, AuditLogEntry, ComplianceControl,
  DocumentVaultItem, FinancialKPI, CashFlowForecast, BudgetVariance,
  ProfitLossStatement, BalanceSheet, CashFlowStatement
} from "@/types";

// ------------------- MOCK USERS (RBAC) -------------------

export const mockUsers: User[] = [
  {
    id: "usr-001",
    email: "admin@enterprise.com",
    name: "Sarah Chen",
    role: "super_admin",
    mfaEnabled: true,
    lastLogin: new Date("2026-05-08T09:30:00"),
    department: "IT Security",
    permissions: ["dashboard:read", "cashflow:read", "cashflow:write", "invoices:read", "invoices:write", "invoices:delete", "ledger:read", "ledger:write", "ledger:approve", "audit:read", "reports:read", "reports:export", "users:manage"]
  },
  {
    id: "usr-002",
    email: "cfo@enterprise.com",
    name: "Michael Roberts",
    role: "cfo",
    mfaEnabled: true,
    lastLogin: new Date("2026-05-08T08:15:00"),
    department: "Finance",
    permissions: ["dashboard:read", "cashflow:read", "cashflow:write", "invoices:read", "invoices:write", "ledger:read", "ledger:write", "ledger:approve", "audit:read", "reports:read", "reports:export"]
  },
  {
    id: "usr-003",
    email: "accountant@enterprise.com",
    name: "Emily Watson",
    role: "accountant",
    mfaEnabled: false,
    lastLogin: new Date("2026-05-07T16:45:00"),
    department: "Accounting",
    permissions: ["dashboard:read", "cashflow:read", "invoices:read", "invoices:write", "ledger:read", "ledger:write", "reports:read"]
  },
  {
    id: "usr-004",
    email: "auditor@enterprise.com",
    name: "James Liu",
    role: "auditor",
    mfaEnabled: true,
    lastLogin: new Date("2026-05-08T10:00:00"),
    department: "External Audit",
    permissions: ["dashboard:read", "cashflow:read", "invoices:read", "ledger:read", "audit:read", "reports:read", "reports:export"]
  },
  {
    id: "usr-005",
    email: "viewer@enterprise.com",
    name: "Lisa Park",
    role: "viewer",
    mfaEnabled: false,
    lastLogin: new Date("2026-05-06T14:20:00"),
    department: "Operations",
    permissions: ["dashboard:read", "reports:read"]
  }
];

// ------------------- CASH ACCOUNTS -------------------

export const mockCashAccounts: CashAccount[] = [
  { id: "acc-001", name: "Primary Operating", accountNumber: "****4521", bankName: "JPMorgan Chase", currency: "USD", balance: 2458900.50, type: "checking", lastReconciled: new Date("2026-05-07") },
  { id: "acc-002", name: "Payroll Account", accountNumber: "****7834", bankName: "Bank of America", currency: "USD", balance: 450000.00, type: "checking", lastReconciled: new Date("2026-05-06") },
  { id: "acc-003", name: "Emergency Reserve", accountNumber: "****9921", bankName: "Wells Fargo", currency: "USD", balance: 1200000.00, type: "savings", lastReconciled: new Date("2026-05-05") },
  { id: "acc-004", name: "EUR Operations", accountNumber: "****3345", bankName: "Deutsche Bank", currency: "EUR", balance: 890000.00, type: "checking", lastReconciled: new Date("2026-05-07") },
  { id: "acc-005", name: "Investment Portfolio", accountNumber: "****6678", bankName: "Fidelity", currency: "USD", balance: 3200000.00, type: "investment", lastReconciled: new Date("2026-05-01") },
  { id: "acc-006", name: "Corporate Credit", accountNumber: "****1123", bankName: "Amex Corporate", currency: "USD", balance: -45000.00, type: "credit", lastReconciled: new Date("2026-05-08") }
];

// ------------------- CASH TRANSACTIONS -------------------

export const mockTransactions: CashTransaction[] = [
  { id: "txn-001", accountId: "acc-001", date: new Date("2026-05-08"), description: "Client Payment - TechCorp", amount: 125000.00, currency: "USD", type: "income", status: "cleared", category: "Software Licenses", reference: "INV-2026-0042", counterparty: "TechCorp Inc" },
  { id: "txn-002", accountId: "acc-001", date: new Date("2026-05-08"), description: "AWS Cloud Services", amount: -45000.00, currency: "USD", type: "expense", status: "cleared", category: "Cloud Infrastructure", reference: "AWS-MAY-2026", counterparty: "Amazon Web Services" },
  { id: "txn-003", accountId: "acc-002", date: new Date("2026-05-07"), description: "Salary Transfer - Engineering", amount: -320000.00, currency: "USD", type: "expense", status: "reconciled", category: "Payroll", reference: "PAY-MAY-001", counterparty: "Internal Transfer" },
  { id: "txn-004", accountId: "acc-004", date: new Date("2026-05-07"), description: "EU Client Payment", amount: 75000.00, currency: "EUR", type: "income", status: "cleared", category: "Consulting", reference: "INV-2026-0038", counterparty: "Deutsche Telecom" },
  { id: "txn-005", accountId: "acc-001", date: new Date("2026-05-06"), description: "Office Rent - May 2026", amount: -28000.00, currency: "USD", type: "expense", status: "reconciled", category: "Facilities", reference: "RENT-MAY-2026", counterparty: "WeWork Properties" },
  { id: "txn-006", accountId: "acc-003", date: new Date("2026-05-05"), description: "Interest Income", amount: 1200.00, currency: "USD", type: "income", status: "reconciled", category: "Interest", reference: "INT-MAY-001", counterparty: "Wells Fargo" },
  { id: "txn-007", accountId: "acc-001", date: new Date("2026-05-05"), description: "Marketing Campaign - Q2", amount: -65000.00, currency: "USD", type: "expense", status: "pending", category: "Marketing", reference: "MKT-Q2-2026", counterparty: "Google Ads" },
  { id: "txn-008", accountId: "acc-006", date: new Date("2026-05-04"), description: "Travel Expenses - Conference", amount: -8500.00, currency: "USD", type: "expense", status: "cleared", category: "Travel", reference: "TRV-001", counterparty: "Delta Airlines" },
  { id: "txn-009", accountId: "acc-001", date: new Date("2026-05-03"), description: "Software License Renewal", amount: -24000.00, currency: "USD", type: "expense", status: "reconciled", category: "Software", reference: "LIC-2026-001", counterparty: "Microsoft Corp" },
  { id: "txn-010", accountId: "acc-004", date: new Date("2026-05-02"), description: "EU Tax Payment", amount: -45000.00, currency: "EUR", type: "expense", status: "reconciled", category: "Tax", reference: "TAX-EU-Q1", counterparty: "German Tax Authority" }
];

// ------------------- INVOICES -------------------

export const mockInvoices: Invoice[] = [
  {
    id: "inv-001",
    invoiceNumber: "INV-2026-0045",
    type: "standard",
    status: "paid",
    clientName: "TechCorp Inc",
    clientEmail: "ap@techcorp.com",
    issueDate: new Date("2026-04-15"),
    dueDate: new Date("2026-05-15"),
    currency: "USD",
    lineItems: [
      { id: "li-001", description: "Enterprise License - Q2 2026", quantity: 1, unitPrice: 100000.00, taxRate: 0.08, total: 108000.00 },
      { id: "li-002", description: "Implementation Services", quantity: 40, unitPrice: 250.00, taxRate: 0.08, total: 10800.00 }
    ],
    subtotal: 110000.00,
    taxTotal: 8800.00,
    total: 118800.00,
    amountPaid: 118800.00,
    balanceDue: 0,
    notes: "Net 30 terms. Early payment discount applied.",
    recurringSchedule: undefined
  },
  {
    id: "inv-002",
    invoiceNumber: "INV-2026-0046",
    type: "standard",
    status: "overdue",
    clientName: "Global Logistics Ltd",
    clientEmail: "finance@globallog.com",
    issueDate: new Date("2026-03-20"),
    dueDate: new Date("2026-04-20"),
    currency: "USD",
    lineItems: [
      { id: "li-003", description: "Supply Chain Optimization Platform", quantity: 1, unitPrice: 85000.00, taxRate: 0.08, total: 91800.00 }
    ],
    subtotal: 85000.00,
    taxTotal: 6800.00,
    total: 91800.00,
    amountPaid: 0,
    balanceDue: 91800.00,
    notes: "Payment overdue by 18 days. Collection notice sent.",
    recurringSchedule: undefined
  },
  {
    id: "inv-003",
    invoiceNumber: "INV-2026-0047",
    type: "recurring",
    status: "sent",
    clientName: "SaaS Ventures LLC",
    clientEmail: "billing@saasventures.io",
    issueDate: new Date("2026-05-01"),
    dueDate: new Date("2026-05-31"),
    currency: "USD",
    lineItems: [
      { id: "li-004", description: "Monthly Platform Subscription", quantity: 1, unitPrice: 15000.00, taxRate: 0.08, total: 16200.00 }
    ],
    subtotal: 15000.00,
    taxTotal: 1200.00,
    total: 16200.00,
    amountPaid: 0,
    balanceDue: 16200.00,
    notes: "Monthly recurring invoice.",
    recurringSchedule: {
      frequency: "monthly",
      startDate: new Date("2026-01-01"),
      nextInvoiceDate: new Date("2026-06-01"),
      maxOccurrences: 12
    }
  },
  {
    id: "inv-004",
    invoiceNumber: "INV-2026-0048",
    type: "standard",
    status: "draft",
    clientName: "Healthcare Systems Inc",
    clientEmail: "procurement@healthsys.com",
    issueDate: new Date("2026-05-08"),
    dueDate: new Date("2026-06-08"),
    currency: "USD",
    lineItems: [
      { id: "li-005", description: "HIPAA Compliance Audit", quantity: 1, unitPrice: 45000.00, taxRate: 0.08, total: 48600.00 },
      { id: "li-006", description: "Security Assessment", quantity: 1, unitPrice: 25000.00, taxRate: 0.08, total: 27000.00 }
    ],
    subtotal: 70000.00,
    taxTotal: 5600.00,
    total: 75600.00,
    amountPaid: 0,
    balanceDue: 75600.00,
    notes: "Pending CFO approval before sending.",
    recurringSchedule: undefined
  },
  {
    id: "inv-005",
    invoiceNumber: "INV-2026-0049",
    type: "standard",
    status: "paid",
    clientName: "FinTech Solutions",
    clientEmail: "accounts@fintechsol.com",
    issueDate: new Date("2026-04-01"),
    dueDate: new Date("2026-04-30"),
    currency: "EUR",
    lineItems: [
      { id: "li-007", description: "API Integration Services", quantity: 120, unitPrice: 500.00, taxRate: 0.19, total: 71400.00 }
    ],
    subtotal: 60000.00,
    taxTotal: 11400.00,
    total: 71400.00,
    amountPaid: 71400.00,
    balanceDue: 0,
    notes: "Paid via wire transfer.",
    recurringSchedule: undefined
  }
];

// ------------------- CHART OF ACCOUNTS -------------------

export const mockChartOfAccounts: ChartOfAccount[] = [
  // Assets (1000-1999)
  { id: "coa-001", code: "1000", name: "Cash and Equivalents", type: "asset", category: "current_asset", balance: 4108900.50, isActive: true, description: "Primary liquid assets" },
  { id: "coa-002", code: "1100", name: "Accounts Receivable", type: "asset", category: "current_asset", balance: 167600.00, isActive: true, description: "Outstanding customer invoices" },
  { id: "coa-003", code: "1200", name: "Inventory", type: "asset", category: "current_asset", balance: 320000.00, isActive: true, description: "Product inventory" },
  { id: "coa-004", code: "1500", name: "Property & Equipment", type: "asset", category: "fixed_asset", balance: 2500000.00, isActive: true, description: "Office buildings and equipment" },
  { id: "coa-005", code: "1600", name: "Software Licenses", type: "asset", category: "intangible_asset", balance: 450000.00, isActive: true, description: "Capitalized software costs" },

  // Liabilities (2000-2999)
  { id: "coa-006", code: "2000", name: "Accounts Payable", type: "liability", category: "current_liability", balance: 187000.00, isActive: true, description: "Outstanding vendor bills" },
  { id: "coa-007", code: "2100", name: "Accrued Expenses", type: "liability", category: "current_liability", balance: 95000.00, isActive: true, description: "Accrued payroll and benefits" },
  { id: "coa-008", code: "2500", name: "Long-term Debt", type: "liability", category: "long_term_liability", balance: 1500000.00, isActive: true, description: "Bank term loan" },

  // Equity (3000-3999)
  { id: "coa-009", code: "3000", name: "Common Stock", type: "equity", category: "equity", balance: 1000000.00, isActive: true, description: "Issued share capital" },
  { id: "coa-010", code: "3100", name: "Retained Earnings", type: "equity", category: "equity", balance: 3855500.50, isActive: true, description: "Accumulated profits" },

  // Revenue (4000-4999)
  { id: "coa-011", code: "4000", name: "Software Revenue", type: "revenue", category: "operating_revenue", balance: 2100000.00, isActive: true, description: "Primary software license revenue" },
  { id: "coa-012", code: "4100", name: "Services Revenue", type: "revenue", category: "operating_revenue", balance: 850000.00, isActive: true, description: "Professional services" },
  { id: "coa-013", code: "4200", name: "Subscription Revenue", type: "revenue", category: "operating_revenue", balance: 486000.00, isActive: true, description: "Recurring subscriptions" },
  { id: "coa-014", code: "4900", name: "Interest Income", type: "revenue", category: "other_revenue", balance: 1200.00, isActive: true, description: "Bank interest" },

  // Expenses (5000-5999)
  { id: "coa-015", code: "5000", name: "Cost of Goods Sold", type: "expense", category: "cost_of_goods_sold", balance: 320000.00, isActive: true, description: "Direct product costs" },
  { id: "coa-016", code: "5100", name: "Salaries & Wages", type: "expense", category: "operating_expense", balance: 1280000.00, isActive: true, description: "Employee compensation" },
  { id: "coa-017", code: "5200", name: "Rent & Facilities", type: "expense", category: "operating_expense", balance: 336000.00, isActive: true, description: "Office rent and utilities" },
  { id: "coa-018", code: "5300", name: "Cloud Infrastructure", type: "expense", category: "operating_expense", balance: 540000.00, isActive: true, description: "AWS, Azure, GCP costs" },
  { id: "coa-019", code: "5400", name: "Marketing & Advertising", type: "expense", category: "operating_expense", balance: 390000.00, isActive: true, description: "Digital and traditional marketing" },
  { id: "coa-020", code: "5500", name: "Software & Tools", type: "expense", category: "operating_expense", balance: 288000.00, isActive: true, description: "SaaS tools and licenses" },
  { id: "coa-021", code: "5600", name: "Travel & Entertainment", type: "expense", category: "operating_expense", balance: 102000.00, isActive: true, description: "Business travel" },
  { id: "coa-022", code: "5700", name: "Tax Expense", type: "expense", category: "other_expense", balance: 180000.00, isActive: true, description: "Income and payroll taxes" }
];

// ------------------- JOURNAL ENTRIES -------------------

export const mockJournalEntries: JournalEntry[] = [
  {
    id: "je-001",
    entryNumber: "JE-2026-0102",
    date: new Date("2026-05-08"),
    description: "Record software revenue - TechCorp",
    reference: "INV-2026-0045",
    lines: [
      { id: "jel-001", accountId: "coa-002", accountName: "Accounts Receivable", accountCode: "1100", debit: 118800.00, credit: 0, description: "Invoice to TechCorp" },
      { id: "jel-002", accountId: "coa-011", accountName: "Software Revenue", accountCode: "4000", debit: 0, credit: 110000.00, description: "Software license revenue" },
      { id: "jel-003", accountId: "coa-012", accountName: "Services Revenue", accountCode: "4100", debit: 0, credit: 8800.00, description: "Implementation services" }
    ],
    totalDebits: 118800.00,
    totalCredits: 118800.00,
    isBalanced: true,
    status: "posted",
    postedBy: "Emily Watson",
    postedAt: new Date("2026-05-08T10:30:00"),
    attachments: ["inv-2026-0045.pdf"]
  },
  {
    id: "je-002",
    entryNumber: "JE-2026-0103",
    date: new Date("2026-05-08"),
    description: "AWS cloud infrastructure expense",
    reference: "AWS-MAY-2026",
    lines: [
      { id: "jel-004", accountId: "coa-018", accountName: "Cloud Infrastructure", accountCode: "5300", debit: 45000.00, credit: 0, description: "May AWS bill" },
      { id: "jel-005", accountId: "coa-001", accountName: "Cash and Equivalents", accountCode: "1000", debit: 0, credit: 45000.00, description: "Payment to AWS" }
    ],
    totalDebits: 45000.00,
    totalCredits: 45000.00,
    isBalanced: true,
    status: "posted",
    postedBy: "Emily Watson",
    postedAt: new Date("2026-05-08T11:00:00"),
    attachments: ["aws-may-2026.pdf"]
  },
  {
    id: "je-003",
    entryNumber: "JE-2026-0104",
    date: new Date("2026-05-07"),
    description: "Payroll accrual - Engineering",
    reference: "PAY-MAY-001",
    lines: [
      { id: "jel-006", accountId: "coa-016", accountName: "Salaries & Wages", accountCode: "5100", debit: 320000.00, credit: 0, description: "Engineering payroll" },
      { id: "jel-007", accountId: "coa-001", accountName: "Cash and Equivalents", accountCode: "1000", debit: 0, credit: 320000.00, description: "Payroll transfer" }
    ],
    totalDebits: 320000.00,
    totalCredits: 320000.00,
    isBalanced: true,
    status: "posted",
    postedBy: "Emily Watson",
    postedAt: new Date("2026-05-07T14:00:00"),
    attachments: ["payroll-may-001.pdf"]
  },
  {
    id: "je-004",
    entryNumber: "JE-2026-0105",
    date: new Date("2026-05-06"),
    description: "Office rent payment",
    reference: "RENT-MAY-2026",
    lines: [
      { id: "jel-008", accountId: "coa-017", accountName: "Rent & Facilities", accountCode: "5200", debit: 28000.00, credit: 0, description: "May office rent" },
      { id: "jel-009", accountId: "coa-001", accountName: "Cash and Equivalents", accountCode: "1000", debit: 0, credit: 28000.00, description: "Rent payment" }
    ],
    totalDebits: 28000.00,
    totalCredits: 28000.00,
    isBalanced: true,
    status: "posted",
    postedBy: "Emily Watson",
    postedAt: new Date("2026-05-06T09:00:00"),
    attachments: ["rent-may-2026.pdf"]
  },
  {
    id: "je-005",
    entryNumber: "JE-2026-0106",
    date: new Date("2026-05-08"),
    description: "Marketing campaign prepayment",
    reference: "MKT-Q2-2026",
    lines: [
      { id: "jel-010", accountId: "coa-019", accountName: "Marketing & Advertising", accountCode: "5400", debit: 65000.00, credit: 0, description: "Q2 marketing campaign" },
      { id: "jel-011", accountId: "coa-001", accountName: "Cash and Equivalents", accountCode: "1000", debit: 0, credit: 65000.00, description: "Google Ads payment" }
    ],
    totalDebits: 65000.00,
    totalCredits: 65000.00,
    isBalanced: true,
    status: "draft",
    postedBy: undefined,
    postedAt: undefined,
    attachments: []
  }
];

// ------------------- AUDIT LOGS -------------------

export const mockAuditLogs: AuditLogEntry[] = [
  { id: "aud-001", timestamp: new Date("2026-05-08T09:30:00"), userId: "usr-001", userName: "Sarah Chen", userRole: "super_admin", action: "LOGIN", entity: "user", entityId: "usr-001", description: "User login successful", ipAddress: "192.168.1.100", userAgent: "Chrome/124.0", sessionId: "sess-001", hash: "a1b2c3d4" },
  { id: "aud-002", timestamp: new Date("2026-05-08T10:30:00"), userId: "usr-003", userName: "Emily Watson", userRole: "accountant", action: "CREATE", entity: "journal_entry", entityId: "je-001", description: "Created journal entry JE-2026-0102", oldValues: undefined, newValues: { entryNumber: "JE-2026-0102", total: 118800 }, ipAddress: "192.168.1.102", userAgent: "Chrome/124.0", sessionId: "sess-003", hash: "e5f6g7h8" },
  { id: "aud-003", timestamp: new Date("2026-05-08T10:35:00"), userId: "usr-003", userName: "Emily Watson", userRole: "accountant", action: "POST", entity: "journal_entry", entityId: "je-001", description: "Posted journal entry JE-2026-0102", oldValues: { status: "draft" }, newValues: { status: "posted" }, ipAddress: "192.168.1.102", userAgent: "Chrome/124.0", sessionId: "sess-003", hash: "i9j0k1l2" },
  { id: "aud-004", timestamp: new Date("2026-05-08T11:00:00"), userId: "usr-003", userName: "Emily Watson", userRole: "accountant", action: "CREATE", entity: "journal_entry", entityId: "je-002", description: "Created journal entry JE-2026-0103", ipAddress: "192.168.1.102", userAgent: "Chrome/124.0", sessionId: "sess-003", hash: "m3n4o5p6" },
  { id: "aud-005", timestamp: new Date("2026-05-08T11:05:00"), userId: "usr-002", userName: "Michael Roberts", userRole: "cfo", action: "APPROVE", entity: "journal_entry", entityId: "je-002", description: "Approved journal entry JE-2026-0103", oldValues: { status: "draft" }, newValues: { status: "posted" }, ipAddress: "192.168.1.101", userAgent: "Firefox/125.0", sessionId: "sess-002", hash: "q7r8s9t0" },
  { id: "aud-006", timestamp: new Date("2026-05-08T12:00:00"), userId: "usr-004", userName: "James Liu", userRole: "auditor", action: "READ", entity: "journal_entry", entityId: "je-001", description: "Viewed journal entry JE-2026-0102", ipAddress: "192.168.1.103", userAgent: "Chrome/124.0", sessionId: "sess-004", hash: "u1v2w3x4" },
  { id: "aud-007", timestamp: new Date("2026-05-08T12:15:00"), userId: "usr-004", userName: "James Liu", userRole: "auditor", action: "EXPORT", entity: "report", entityId: "rpt-001", description: "Exported audit trail report", ipAddress: "192.168.1.103", userAgent: "Chrome/124.0", sessionId: "sess-004", hash: "y5z6a7b8" },
  { id: "aud-008", timestamp: new Date("2026-05-08T13:00:00"), userId: "usr-001", userName: "Sarah Chen", userRole: "super_admin", action: "UPDATE", entity: "user", entityId: "usr-003", description: "Updated user permissions for Emily Watson", oldValues: { permissions: ["dashboard:read"] }, newValues: { permissions: ["dashboard:read", "invoices:write"] }, ipAddress: "192.168.1.100", userAgent: "Chrome/124.0", sessionId: "sess-001", hash: "c9d0e1f2" },
  { id: "aud-009", timestamp: new Date("2026-05-07T14:00:00"), userId: "usr-003", userName: "Emily Watson", userRole: "accountant", action: "POST", entity: "journal_entry", entityId: "je-003", description: "Posted payroll journal entry", ipAddress: "192.168.1.102", userAgent: "Chrome/124.0", sessionId: "sess-005", hash: "g3h4i5j6" },
  { id: "aud-010", timestamp: new Date("2026-05-07T16:30:00"), userId: "usr-002", userName: "Michael Roberts", userRole: "cfo", action: "READ", entity: "report", entityId: "rpt-002", description: "Viewed cash flow forecast", ipAddress: "192.168.1.101", userAgent: "Firefox/125.0", sessionId: "sess-002", hash: "k7l8m9n0" }
];

// ------------------- COMPLIANCE CONTROLS -------------------

export const mockComplianceControls: ComplianceControl[] = [
  { id: "cc-001", framework: "SOC2", controlId: "CC6.1", title: "Logical Access Security", description: "Logical access to financial systems is restricted to authorized users", status: "compliant", lastAssessed: new Date("2026-04-15"), nextAssessment: new Date("2026-07-15"), evidence: ["access_review_q1.pdf", "rbac_matrix.xlsx"], owner: "Sarah Chen", riskLevel: "high" },
  { id: "cc-002", framework: "SOC2", controlId: "CC7.1", title: "System Monitoring", description: "Financial systems are monitored for unauthorized access", status: "compliant", lastAssessed: new Date("2026-04-15"), nextAssessment: new Date("2026-07-15"), evidence: ["siem_logs.pdf", "monitoring_config.pdf"], owner: "Sarah Chen", riskLevel: "high" },
  { id: "cc-003", framework: "SOC2", controlId: "CC8.1", title: "Change Management", description: "Changes to financial systems are authorized and tested", status: "partial", lastAssessed: new Date("2026-04-15"), nextAssessment: new Date("2026-07-15"), evidence: ["change_log.pdf"], owner: "Michael Roberts", riskLevel: "medium" },
  { id: "cc-004", framework: "GDPR", controlId: "ART-17", title: "Right to Erasure", description: "Personal data can be deleted upon request within 30 days", status: "compliant", lastAssessed: new Date("2026-03-20"), nextAssessment: new Date("2026-06-20"), evidence: ["deletion_procedure.pdf", "dpia_assessment.pdf"], owner: "Sarah Chen", riskLevel: "high" },
  { id: "cc-005", framework: "GDPR", controlId: "ART-32", title: "Data Encryption", description: "Personal data is encrypted at rest and in transit", status: "compliant", lastAssessed: new Date("2026-03-20"), nextAssessment: new Date("2026-06-20"), evidence: ["encryption_audit.pdf", "tls_config.pdf"], owner: "Sarah Chen", riskLevel: "high" },
  { id: "cc-006", framework: "PCI-DSS", controlId: "REQ-3", title: "Cardholder Data Protection", description: "Sensitive authentication data is not stored after authorization", status: "compliant", lastAssessed: new Date("2026-02-10"), nextAssessment: new Date("2026-05-10"), evidence: ["tokenization_report.pdf", "network_scan.pdf"], owner: "Michael Roberts", riskLevel: "critical" },
  { id: "cc-007", framework: "PCI-DSS", controlId: "REQ-8", title: "User Authentication", description: "Strong authentication is required for system access", status: "partial", lastAssessed: new Date("2026-02-10"), nextAssessment: new Date("2026-05-10"), evidence: ["mfa_rollout.pdf"], owner: "Sarah Chen", riskLevel: "critical" }
];

// ------------------- DOCUMENT VAULT -------------------

export const mockDocuments: DocumentVaultItem[] = [
  { id: "doc-001", name: "Q1-2026-Financial-Statements.pdf", type: "report", size: 2450000, uploadedBy: "Emily Watson", uploadedAt: new Date("2026-04-15"), version: 3, tags: ["financial", "quarterly", "audit"], encrypted: true, retentionDate: new Date("2031-04-15"), checksum: "sha256:a1b2..." },
  { id: "doc-002", name: "Tax-Return-2025.pdf", type: "tax_document", size: 8900000, uploadedBy: "Michael Roberts", uploadedAt: new Date("2026-03-01"), version: 1, tags: ["tax", "annual", "confidential"], encrypted: true, retentionDate: new Date("2031-03-01"), checksum: "sha256:c3d4..." },
  { id: "doc-003", name: "AWS-Contract-2026.pdf", type: "contract", size: 1200000, uploadedBy: "Sarah Chen", uploadedAt: new Date("2026-01-15"), version: 2, tags: ["vendor", "cloud", "legal"], encrypted: true, retentionDate: new Date("2028-01-15"), checksum: "sha256:e5f6..." },
  { id: "doc-004", name: "Invoice-TechCorp-0045.pdf", type: "invoice", size: 450000, uploadedBy: "Emily Watson", uploadedAt: new Date("2026-04-15"), version: 1, tags: ["invoice", "techcorp", "paid"], encrypted: false, retentionDate: new Date("2029-04-15"), checksum: "sha256:g7h8..." },
  { id: "doc-005", name: "Expense-Report-March.xlsx", type: "receipt", size: 320000, uploadedBy: "Lisa Park", uploadedAt: new Date("2026-04-05"), version: 1, tags: ["expense", "march", "travel"], encrypted: false, retentionDate: new Date("2028-04-05"), checksum: "sha256:i9j0..." }
];

// ------------------- FINANCIAL KPIS -------------------

export const mockKPIs: FinancialKPI[] = [
  { name: "Total Cash Position", value: 4108900.50, previousValue: 3850000.00, change: 258900.50, changePercent: 6.72, trend: "up", target: 4000000.00, unit: "currency" },
  { name: "Monthly Recurring Revenue", value: 486000.00, previousValue: 450000.00, change: 36000.00, changePercent: 8.00, trend: "up", target: 500000.00, unit: "currency" },
  { name: "Days Sales Outstanding", value: 32, previousValue: 28, change: 4, changePercent: 14.29, trend: "down", target: 30, unit: "count" },
  { name: "Operating Margin", value: 24.5, previousValue: 22.1, change: 2.4, changePercent: 10.86, trend: "up", target: 25.0, unit: "percentage" },
  { name: "Current Ratio", value: 2.8, previousValue: 2.6, change: 0.2, changePercent: 7.69, trend: "up", target: 2.5, unit: "ratio" },
  { name: "Burn Rate", value: 385000.00, previousValue: 420000.00, change: -35000.00, changePercent: -8.33, trend: "up", target: 350000.00, unit: "currency" }
];

// ------------------- CASH FLOW FORECAST -------------------

export const mockCashFlowForecast: CashFlowForecast[] = [
  { date: new Date("2026-05-09"), projectedInflow: 125000, projectedOutflow: 45000, netPosition: 80000, confidence: 0.95 },
  { date: new Date("2026-05-10"), projectedInflow: 50000, projectedOutflow: 320000, netPosition: -270000, confidence: 0.90 },
  { date: new Date("2026-05-13"), projectedInflow: 200000, projectedOutflow: 85000, netPosition: 115000, confidence: 0.85 },
  { date: new Date("2026-05-15"), projectedInflow: 350000, projectedOutflow: 120000, netPosition: 230000, confidence: 0.80 },
  { date: new Date("2026-05-20"), projectedInflow: 180000, projectedOutflow: 95000, netPosition: 85000, confidence: 0.75 },
  { date: new Date("2026-05-30"), projectedInflow: 500000, projectedOutflow: 280000, netPosition: 220000, confidence: 0.70 },
  { date: new Date("2026-06-15"), projectedInflow: 450000, projectedOutflow: 310000, netPosition: 140000, confidence: 0.65 },
  { date: new Date("2026-06-30"), projectedInflow: 600000, projectedOutflow: 350000, netPosition: 250000, confidence: 0.60 },
  { date: new Date("2026-07-15"), projectedInflow: 480000, projectedOutflow: 290000, netPosition: 190000, confidence: 0.55 },
  { date: new Date("2026-07-31"), projectedInflow: 550000, projectedOutflow: 320000, netPosition: 230000, confidence: 0.50 }
];

// ------------------- BUDGET VARIANCE -------------------

export const mockBudgetVariance: BudgetVariance[] = [
  { accountId: "coa-011", accountName: "Software Revenue", budgeted: 2000000, actual: 2100000, variance: 100000, variancePercent: 5.0, status: "favorable" },
  { accountId: "coa-012", accountName: "Services Revenue", budgeted: 900000, actual: 850000, variance: -50000, variancePercent: -5.56, status: "unfavorable" },
  { accountId: "coa-016", accountName: "Salaries & Wages", budgeted: 1200000, actual: 1280000, variance: -80000, variancePercent: -6.67, status: "unfavorable" },
  { accountId: "coa-018", accountName: "Cloud Infrastructure", budgeted: 500000, actual: 540000, variance: -40000, variancePercent: -8.0, status: "unfavorable" },
  { accountId: "coa-019", accountName: "Marketing & Advertising", budgeted: 400000, actual: 390000, variance: 10000, variancePercent: 2.5, status: "favorable" },
  { accountId: "coa-017", accountName: "Rent & Facilities", budgeted: 340000, actual: 336000, variance: 4000, variancePercent: 1.18, status: "favorable" }
];

// ------------------- FINANCIAL STATEMENTS -------------------

export const mockProfitLoss: ProfitLossStatement = {
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-04-30"),
  revenue: { operating: 3436000, other: 1200, total: 3437200 },
  expenses: { cogs: 320000, operating: 2448000, other: 180000, total: 2948000 },
  netIncome: 489200,
  grossProfit: 3116000,
  operatingIncome: 668000,
  ebitda: 842000
};

export const mockBalanceSheet: BalanceSheet = {
  asOfDate: new Date("2026-04-30"),
  assets: {
    current: [
      { name: "Cash and Equivalents", amount: 4108900.50 },
      { name: "Accounts Receivable", amount: 167600.00 },
      { name: "Inventory", amount: 320000.00 }
    ],
    fixed: [
      { name: "Property & Equipment", amount: 2500000.00 }
    ],
    intangible: [
      { name: "Software Licenses", amount: 450000.00 }
    ],
    total: 7546500.50
  },
  liabilities: {
    current: [
      { name: "Accounts Payable", amount: 187000.00 },
      { name: "Accrued Expenses", amount: 95000.00 }
    ],
    longTerm: [
      { name: "Long-term Debt", amount: 1500000.00 }
    ],
    total: 1782000.00
  },
  equity: {
    items: [
      { name: "Common Stock", amount: 1000000.00 },
      { name: "Retained Earnings", amount: 3855500.50 }
    ],
    total: 4855500.50
  },
  totalLiabilitiesAndEquity: 6637500.00
};

export const mockCashFlowStatement: CashFlowStatement = {
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-04-30"),
  operating: {
    items: [
      { description: "Net Income", amount: 489200 },
      { description: "Depreciation & Amortization", amount: 174000 },
      { description: "Changes in Working Capital", amount: -85000 }
    ],
    net: 578200
  },
  investing: {
    items: [
      { description: "Purchase of Equipment", amount: -250000 },
      { description: "Software Development Costs", amount: -180000 }
    ],
    net: -430000
  },
  financing: {
    items: [
      { description: "Debt Repayment", amount: -75000 },
      { description: "Stock Issuance", amount: 500000 }
    ],
    net: 425000
  },
  netIncrease: 573200,
  beginningCash: 3535700.50,
  endingCash: 4108900.50
};

// ------------------- HELPER FUNCTIONS -------------------

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function calculateDaysOverdue(dueDate: Date): number {
  const today = new Date();
  const diff = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export const daysOverdue = calculateDaysOverdue;

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    sent: "bg-blue-100 text-blue-800",
    draft: "bg-gray-100 text-gray-800",
    overdue: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-500",
    viewed: "bg-yellow-100 text-yellow-800",
    posted: "bg-green-100 text-green-800",
    compliant: "bg-green-100 text-green-800",
    non_compliant: "bg-red-100 text-red-800",
    partial: "bg-yellow-100 text-yellow-800",
    favorable: "bg-green-100 text-green-800",
    unfavorable: "bg-red-100 text-red-800",
    on_track: "bg-blue-100 text-blue-800"
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}
