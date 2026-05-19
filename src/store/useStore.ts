"use client";

// ============================================================
// ZUSTAND STATE MANAGEMENT
// ============================================================
// Modular stores for different domains
// In production, server state would use React Query (TanStack Query)

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  User, Invoice, InvoiceStatus, JournalEntry, CashAccount,
  CashTransaction, AuditLogEntry, ComplianceControl, DocumentVaultItem,
  DashboardWidget
} from "@/types";
import {
  mockUsers, mockInvoices, mockJournalEntries, mockCashAccounts,
  mockTransactions, mockAuditLogs, mockComplianceControls, mockDocuments
} from "@/data/mockData";

// ------------------- AUTH STORE -------------------

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  mfaRequired: boolean;
  mfaVerified: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  verifyMfa: (code: string) => boolean;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      mfaRequired: false,
      mfaVerified: false,

      login: async (email: string, password: string) => {
        // Simulate API call to NestJS Auth Service
        await new Promise((resolve) => setTimeout(resolve, 800));

        const user = mockUsers.find((u) => u.email === email);
        if (!user) return false;

        // Simulate password check (in production: bcrypt comparison)
        if (password !== "password123") return false;

        set({ 
          user, 
          isAuthenticated: true, 
          mfaRequired: user.mfaEnabled,
          mfaVerified: !user.mfaEnabled 
        });

        return true;
      },

      verifyMfa: (code: string) => {
        // Simulate TOTP verification (in production: speakeasy.verify)
        if (code === "123456") {
          set({ mfaVerified: true });
          return true;
        }
        return false;
      },

      logout: () => {
        set({ user: null, isAuthenticated: false, mfaRequired: false, mfaVerified: false });
      },

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        return user.permissions.includes(permission as never) || user.role === "super_admin";
      }
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated })
    }
  )
);

// ------------------- INVOICE STORE -------------------

interface InvoiceStore {
  invoices: Invoice[];
  selectedInvoice: Invoice | null;
  filterStatus: InvoiceStatus | "all";
  searchQuery: string;
  setFilterStatus: (status: InvoiceStatus | "all") => void;
  setSearchQuery: (query: string) => void;
  selectInvoice: (invoice: Invoice | null) => void;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => void;
  createInvoice: (invoice: Omit<Invoice, "id" | "invoiceNumber">) => void;
  getFilteredInvoices: () => Invoice[];
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  invoices: mockInvoices,
  selectedInvoice: null,
  filterStatus: "all",
  searchQuery: "",

  setFilterStatus: (status) => set({ filterStatus: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  selectInvoice: (invoice) => set({ selectedInvoice: invoice }),

  updateInvoiceStatus: (id, status) => {
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === id ? { ...inv, status } : inv
      )
    }));
  },

  createInvoice: (invoiceData) => {
    const newInvoice: Invoice = {
      ...invoiceData,
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-2026-${String(get().invoices.length + 46).padStart(4, "0")}`
    };
    set((state) => ({ invoices: [...state.invoices, newInvoice] }));
  },

  getFilteredInvoices: () => {
    const { invoices, filterStatus, searchQuery } = get();
    return invoices.filter((inv) => {
      const matchesStatus = filterStatus === "all" || inv.status === filterStatus;
      const matchesSearch = 
        inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }
}));

// ------------------- LEDGER STORE -------------------

interface LedgerStore {
  journalEntries: JournalEntry[];
  selectedEntry: JournalEntry | null;
  filterStatus: "all" | "draft" | "posted";
  selectEntry: (entry: JournalEntry | null) => void;
  setFilterStatus: (status: "all" | "draft" | "posted") => void;
  postEntry: (id: string) => void;
  createEntry: (entry: Omit<JournalEntry, "id" | "entryNumber" | "isBalanced">) => void;
}

export const useLedgerStore = create<LedgerStore>((set, get) => ({
  journalEntries: mockJournalEntries,
  selectedEntry: null,
  filterStatus: "all",

  selectEntry: (entry) => set({ selectedEntry: entry }),
  setFilterStatus: (status) => set({ filterStatus: status }),

  postEntry: (id) => {
    set((state) => ({
      journalEntries: state.journalEntries.map((entry) =>
        entry.id === id
          ? { ...entry, status: "posted" as const, postedAt: new Date(), postedBy: get().selectedEntry?.postedBy || "Current User" }
          : entry
      )
    }));
  },

  createEntry: (entryData) => {
    const totalDebits = entryData.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = entryData.lines.reduce((sum, line) => sum + line.credit, 0);

    const newEntry: JournalEntry = {
      ...entryData,
      id: `je-${Date.now()}`,
      entryNumber: `JE-2026-${String(get().journalEntries.length + 107).padStart(4, "0")}`,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      totalDebits,
      totalCredits
    };

    set((state) => ({ journalEntries: [...state.journalEntries, newEntry] }));
  }
}));

// ------------------- CASH FLOW STORE -------------------

interface CashFlowStore {
  accounts: CashAccount[];
  transactions: CashTransaction[];
  selectedAccount: CashAccount | null;
  dateRange: { from: Date; to: Date };
  selectAccount: (account: CashAccount | null) => void;
  setDateRange: (range: { from: Date; to: Date }) => void;
  getAccountTransactions: (accountId: string) => CashTransaction[];
  getTotalBalance: () => number;
}

export const useCashFlowStore = create<CashFlowStore>((set, get) => ({
  accounts: mockCashAccounts,
  transactions: mockTransactions,
  selectedAccount: null,
  dateRange: { from: new Date("2026-05-01"), to: new Date("2026-05-31") },

  selectAccount: (account) => set({ selectedAccount: account }),
  setDateRange: (range) => set({ dateRange: range }),

  getAccountTransactions: (accountId) => {
    return get().transactions.filter((t) => t.accountId === accountId);
  },

  getTotalBalance: () => {
    return get().accounts.reduce((sum, acc) => {
      // Simple currency conversion mock (1 EUR = 1.08 USD)
      const rate = acc.currency === "EUR" ? 1.08 : 1;
      return sum + (acc.balance * rate);
    }, 0);
  }
}));

// ------------------- AUDIT STORE -------------------

interface AuditStore {
  logs: AuditLogEntry[];
  complianceControls: ComplianceControl[];
  documents: DocumentVaultItem[];
  filterAction: string;
  filterEntity: string;
  filterDateRange: { from: Date; to: Date };
  setFilters: (filters: { action?: string; entity?: string; dateRange?: { from: Date; to: Date } }) => void;
  getFilteredLogs: () => AuditLogEntry[];
  exportLogs: () => string;
}

export const useAuditStore = create<AuditStore>((set, get) => ({
  logs: mockAuditLogs,
  complianceControls: mockComplianceControls,
  documents: mockDocuments,
  filterAction: "all",
  filterEntity: "all",
  filterDateRange: { from: new Date("2026-05-01"), to: new Date("2026-05-31") },

  setFilters: (filters) => set((state) => ({ ...state, ...filters })),

  getFilteredLogs: () => {
    const { logs, filterAction, filterEntity, filterDateRange } = get();
    return logs.filter((log) => {
      const matchesAction = filterAction === "all" || log.action === filterAction;
      const matchesEntity = filterEntity === "all" || log.entity === filterEntity;
      const matchesDate = log.timestamp >= filterDateRange.from && log.timestamp <= filterDateRange.to;
      return matchesAction && matchesEntity && matchesDate;
    });
  },

  exportLogs: () => {
    // Simulate CSV export
    const headers = "Timestamp,User,Action,Entity,Description,IP Address\n";
    const rows = get().getFilteredLogs()
      .map((log) => `${log.timestamp.toISOString()},${log.userName},${log.action},${log.entity},${log.description},${log.ipAddress}`)
      .join("\n");
    return headers + rows;
  }
}));

// ------------------- DASHBOARD STORE -------------------

interface DashboardStore {
  widgets: DashboardWidget[];
  sidebarCollapsed: boolean;
  currentPage: string;
  toggleSidebar: () => void;
  setCurrentPage: (page: string) => void;
  reorderWidgets: (widgets: DashboardWidget[]) => void;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      widgets: [
        { id: "widget-1", type: "kpi", title: "Cash Position", position: { x: 0, y: 0, w: 3, h: 2 }, config: {} },
        { id: "widget-2", type: "chart", title: "Revenue Trend", position: { x: 3, y: 0, w: 6, h: 2 }, config: {} },
        { id: "widget-3", type: "alert", title: "Overdue Invoices", position: { x: 9, y: 0, w: 3, h: 2 }, config: {} },
        { id: "widget-4", type: "table", title: "Recent Transactions", position: { x: 0, y: 2, w: 6, h: 3 }, config: {} },
        { id: "widget-5", type: "chart", title: "Expense Breakdown", position: { x: 6, y: 2, w: 6, h: 3 }, config: {} }
      ],
      sidebarCollapsed: false,
      currentPage: "dashboard",

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentPage: (page) => set({ currentPage: page }),
      reorderWidgets: (widgets) => set({ widgets })
    }),
    {
      name: "dashboard-preferences"
    }
  )
);
