# Enterprise Financial Management System - Development Guide

## Overview
This guide walks you through building a production-grade Enterprise Financial Management System using the exact architecture specified in the requirements document.

## Architecture Recap (from PDF)
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Shadcn UI
- **State Management**: Zustand (client), React Query (server)
- **Backend**: NestJS microservices (simulated via mock API layer in this prototype)
- **Database**: PostgreSQL with Prisma (mocked)
- **Security**: RBAC, MFA, AES-256 encryption, TLS 1.3, OWASP Top 10 2025 compliance

---

## Step 1: Project Initialization

### 1.1 Create Next.js Project
```bash
npx create-next-app@latest financial-management-system   --typescript   --tailwind   --eslint   --app   --src-dir   --import-alias "@/*"
```

**Why Next.js App Router?**
- Server Components reduce client-side JavaScript
- Server Actions for form submissions
- Built-in API routes (simulating microservices gateway)
- SEO-friendly for public-facing reports

### 1.2 Install Dependencies
```bash
# Core dependencies
npm install zustand @tanstack/react-query axios recharts date-fns clsx tailwind-merge

# UI Components (Shadcn UI)
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card table tabs dialog input label badge avatar dropdown-menu separator scroll-area sheet toast

# Security & Utilities
npm install bcryptjs jsonwebtoken zod react-hook-form @hookform/resolvers
npm install -D @types/bcryptjs @types/jsonwebtoken
```

---

## Step 2: TypeScript Configuration & Types

### 2.1 Strict TypeScript Setup
Enable strict mode in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 2.2 Domain Types (src/types/index.ts)
We define strict types for all financial entities to prevent runtime errors:

- **User**: Role-based access control (RBAC)
- **Invoice**: AR/AP tracking with status workflow
- **Transaction**: Double-entry bookkeeping (debit/credit)
- **AuditLog**: Immutable event recording
- **FinancialStatement**: P&L, Balance Sheet, Cash Flow

**Key Design Decision**: Using discriminated unions for invoice status:
```typescript
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
```
This enables exhaustive switch statements and prevents invalid state transitions.

---

## Step 3: State Management with Zustand

### 3.1 Why Zustand over Redux?
- Minimal boilerplate
- TypeScript-first
- No providers needed
- Perfect for client-side UI state (sidebar, modals, filters)

### 3.2 Store Architecture
We implement a **modular store pattern**:
- `useAuthStore`: MFA, JWT tokens, RBAC permissions
- `useDashboardStore`: KPIs, real-time cash position
- `useInvoiceStore`: Invoice CRUD, recurring billing logic
- `useLedgerStore`: Journal entries, trial balance
- `useAuditStore`: Immutable log viewer

**Security Note**: Store JWT in httpOnly cookies (not localStorage) to prevent XSS. Zustand persists only UI state.

---

## Step 4: Component Architecture

### 4.1 Atomic Design Methodology
- **Atoms**: Button, Input, Badge (Shadcn UI)
- **Molecules**: InvoiceCard, TransactionRow, KPIWidget
- **Organisms**: InvoiceTable, CashFlowChart, LedgerJournal
- **Templates**: DashboardLayout, AuthLayout
- **Pages**: Route-specific compositions

### 4.2 Server vs Client Components
- **Server Components** (default): Data tables, reports, static content
- **Client Components** ("use client"): Interactive charts, forms, real-time widgets

**Performance Optimization**: Use `React.Suspense` boundaries around heavy components like charts.

---

## Step 5: Feature Implementation

### 5.1 Cash Flow Management
**Requirements from PDF**: Real-time AR/AP tracking, multi-currency, forecasting

Implementation:
1. **AR/AP Aging Report**: Calculate days overdue using `date-fns`
2. **Cash Position Widget**: Sum of all liquid accounts
3. **Forecasting Chart**: 90-day projection using historical weighted average
4. **Multi-currency**: Base currency USD, real-time conversion rates (mocked)

### 5.2 Invoicing & Billing
**Requirements**: Automated generation, recurring schedules, templates, payment gateway

Implementation:
1. **Invoice Generator**: PDF generation using `@react-pdf/renderer`
2. **Recurring Logic**: Cron-like scheduling (daily/weekly/monthly/yearly)
3. **Template System**: JSON-based template configuration
4. **Payment Simulation**: Stripe-like webhook handling (mocked)

### 5.3 General Ledger
**Requirements**: Double-entry bookkeeping, automated journals, financial statements

Implementation:
1. **Journal Entry Form**: Debit/Credit validation (must balance to zero)
2. **Chart of Accounts**: Hierarchical account structure (1000-Assets, 2000-Liabilities, etc.)
3. **Trial Balance**: Automated aggregation by account
4. **Financial Statements**:
   - P&L: Revenue - Expenses (period-based)
   - Balance Sheet: Assets = Liabilities + Equity (point-in-time)
   - Cash Flow: Operating/Investing/Financing activities

### 5.4 Audit & Compliance
**Requirements**: Immutable trails, SOC 2/GDPR/PCI-DSS tools

Implementation:
1. **Audit Trail**: Append-only log with cryptographic hashing (simulated)
2. **Document Vault**: S3-like storage with version control (mocked)
3. **Compliance Dashboard**: SOC 2 control monitoring, GDPR data map
4. **Data Retention**: Automated purging policies (GDPR "right to be forgotten")

### 5.5 Reporting & Analytics
**Requirements**: Custom dashboards, ad-hoc reporting, variance analysis

Implementation:
1. **Widget System**: Drag-and-drop dashboard builder (simulated)
2. **Report Builder**: SQL-like query builder (mocked)
3. **Variance Analysis**: Budget vs Actual with percentage calculations
4. **Export**: CSV/Excel/PDF generation

---

## Step 6: Security Implementation

### 6.1 OWASP Top 10 2025 Mitigations

| Vulnerability | Mitigation |
|--------------|------------|
| Broken Access Control | RBAC with middleware checks, principle of least privilege |
| Cryptographic Failures | AES-256 encryption, TLS 1.3, AWS KMS key rotation |
| Injection | Zod validation, parameterized queries (Prisma), output encoding |
| Insecure Design | Threat modeling, secure defaults, fail-safe |
| Security Misconfiguration | Security headers, minimal attack surface |
| Vulnerable Components | Dependency scanning, automated updates |
| Auth Failures | MFA, secure session management, JWT best practices |
| Data Integrity Failures | Immutable audit logs, digital signatures |
| Logging Failures | Comprehensive audit trails, SIEM integration |
| SSRF | URL validation, deny-by-default network policies |

### 6.2 RBAC Implementation
Roles:
- **Super Admin**: Full system access
- **CFO**: Read/write financial data, approve journals
- **Accountant**: Create invoices, record transactions
- **Auditor**: Read-only access to all data, audit trails
- **Viewer**: Dashboard and reports only

### 6.3 Data Encryption
- **In Transit**: TLS 1.3+ enforced
- **At Rest**: AES-256 for database fields (PII, bank accounts)
- **Key Management**: Simulated AWS KMS integration

---

## Step 7: Backend Simulation (Mock API Layer)

Since we're building a frontend prototype, we simulate the NestJS microservices:

### 7.1 API Route Structure (Next.js App Router)
```
app/api/
├── auth/
│   ├── login/route.ts      # JWT + MFA simulation
│   └── refresh/route.ts    # Token rotation
├── invoices/
│   └── route.ts            # CRUD + pagination
├── transactions/
│   └── route.ts            # Double-entry validation
├── audit/
│   └── route.ts            # Immutable logging
└── reports/
    └── route.ts            # Financial statement generation
```

### 7.2 Data Layer (Mock)
We use an in-memory database with realistic seed data:
- 50+ transactions across multiple accounts
- 20+ invoices (various statuses)
- Complete chart of accounts
- 100+ audit log entries

---

## Step 8: Testing Strategy

### 8.1 Unit Tests (Vitest)
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

Test coverage targets:
- Utility functions (100%)
- Store logic (90%)
- Component rendering (80%)

### 8.2 Integration Tests
- API route testing
- Authentication flows
- Data mutation workflows

### 8.3 E2E Tests (Playwright)
```bash
npm install -D @playwright/test
```

Critical paths:
1. Login → Dashboard → Create Invoice → View Report
2. Journal Entry → Trial Balance → Financial Statement
3. Audit Log → Export → Verify Integrity

---

## Step 9: Deployment Preparation

### 9.1 Docker Configuration
```dockerfile
# Multi-stage build for production
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

### 9.2 Environment Variables
```env
# Security
NEXTAUTH_SECRET=your-256-bit-secret
JWT_EXPIRATION=15m
REFRESH_TOKEN_EXPIRATION=7d
MFA_ENCRYPTION_KEY=your-aes-key

# Database (future Prisma connection)
DATABASE_URL=postgresql://user:pass@localhost:5432/financial_db

# External Services
AWS_S3_BUCKET=financial-documents
KONG_API_URL=http://localhost:8000
KAFKA_BROKERS=localhost:9092
```

---

## Step 10: Running the Application

### Development Mode
```bash
npm run dev
# Opens http://localhost:3000
```

### Production Build
```bash
npm run build
npm start
```

---

## Learning Path Summary

1. **Week 1**: Setup, types, and layout components
2. **Week 2**: Authentication and RBAC
3. **Week 3**: Cash Flow and Invoicing modules
4. **Week 4**: General Ledger and double-entry system
5. **Week 5**: Audit trails and compliance features
6. **Week 6**: Reporting, analytics, and dashboard
7. **Week 7**: Security hardening and testing
8. **Week 8**: Deployment and DevOps integration

---

## Next Steps for Full Production

To evolve this prototype into the full microservices architecture:

1. **Extract Backend**: Move API routes to NestJS microservices
2. **Add Database**: Replace mock data with PostgreSQL + Prisma
3. **Message Queue**: Implement Kafka for event-driven architecture
4. **API Gateway**: Deploy Kong for rate limiting and auth
5. **Kubernetes**: Containerize and orchestrate on AWS EKS/GKE
6. **Monitoring**: Add Datadog/Prometheus for observability
7. **Compliance**: Implement real SOC 2/GDPR/PCI-DSS controls

---

*This prototype demonstrates all functional requirements while maintaining the exact frontend architecture specified in the technical document.*
