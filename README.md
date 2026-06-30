# Enterprise Financial Management System

A production-grade financial management platform built with **Next.js 14**, **TypeScript**, **Tailwind CSS**, and **Shadcn UI** — implementing the exact architecture specified in the technical requirements document.

[![CI/CD](https://github.com/YOUR_USERNAME/financial-management-system/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/financial-management-system/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

---

## Quick Start

### Option 1: View the Standalone Demo (Fastest)
Open `public/demo.html` in any modern browser. No build step required.

### Option 2: Run the Full Next.js Application

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/financial-management-system.git
cd financial-management-system

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open http://localhost:3000
```

---

## Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repo to [vercel.com](https://vercel.com) for automatic deployments.

### Other Platforms

- **Railway**: `railway up`
- **Netlify**: `netlify deploy --build --prod`
- **AWS/Docker**: See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    NEXT.JS 14 (App Router)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Dashboard  │  │  Cash Flow  │  │  Invoicing & Billing │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Ledger    │  │    Audit    │  │  Reports & Analytics │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                              │
│  State: Zustand  │  Charts: Recharts  │  UI: Radix + Tailwind │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Mock Data Layer   │
                    │  (Simulates NestJS  │
                    │   Microservices)    │
                    └─────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 14 (App Router) | Server Components, Server Actions, SEO |
| **Language** | TypeScript 5.3+ | Strict typing, zero runtime errors |
| **Styling** | Tailwind CSS 3.4 | Utility-first, responsive design |
| **UI Components** | Shadcn UI + Radix | Accessible, customizable primitives |
| **State (Client)** | Zustand 4.5 | Lightweight, TypeScript-first |
| **State (Server)** | React Query 5.24 | Caching, synchronization |
| **Charts** | Recharts 2.12 | Interactive financial visualizations |
| **Icons** | Lucide React | Consistent iconography |
| **Backend** | Mock API Layer | Simulates NestJS microservices |
| **Database** | In-memory store | Simulates PostgreSQL + Prisma |

---

## Features Implemented

### 1. Cash Flow Management
- Real-time tracking of 6 bank accounts (USD, EUR, multi-currency)
- Transaction history with status (pending/cleared/reconciled)
- 90-day cash flow forecasting with confidence intervals
- Account filtering and drill-down

### 2. Invoicing & Billing
- Invoice lifecycle: draft → sent → paid → overdue
- Recurring billing schedules
- Multi-currency support (USD, EUR, GBP)
- Overdue tracking with aging analysis
- Create invoice modal with validation

### 3. General Ledger
- Double-entry bookkeeping (debits = credits validation)
- Chart of Accounts (22 accounts, 5 types)
- Journal entry workflow: draft → posted
- Trial balance aggregation
- Financial statement generation

### 4. Audit & Compliance
- **SOC 2 Type II**: 3 controls monitored
- **GDPR**: 2 controls (Right to Erasure, Data Encryption)
- **PCI-DSS**: 2 controls (Cardholder Data, Authentication)
- Immutable audit trail with 8 logged events
- SHA-256 integrity hashes (simulated)
- CSV export functionality

### 5. Reports & Analytics
- **Profit & Loss Statement**: Revenue, COGS, Expenses, Net Income
- **Balance Sheet**: Assets, Liabilities, Equity
- **Cash Flow Statement**: Operating, Investing, Financing
- **Budget vs Actual**: Variance analysis with favorable/unfavorable indicators
- Export to PDF (simulated)

### 6. Security & RBAC
- 5 user roles: Super Admin, CFO, Accountant, Auditor, Viewer
- Permission-based access control
- Multi-Factor Authentication simulation
- Session management

---

## Project Structure

```
financial-management-system/
├── .github/
│   ├── workflows/ci.yml          # GitHub Actions CI/CD
│   ├── ISSUE_TEMPLATE/            # Issue templates
│   └── PULL_REQUEST_TEMPLATE.md   # PR template
├── docs/
│   ├── DEV_GUIDE.md              # Development guide
│   ├── DEPLOYMENT_GUIDE.md       # Deployment guide
│   └── GITHUB_SETUP_GUIDE.md     # GitHub setup guide
├── public/
│   └── demo.html                 # Standalone demo
├── src/
│   ├── app/                      # Next.js pages
│   │   ├── page.tsx              # Dashboard
│   │   ├── cashflow/page.tsx     # Cash Flow
│   │   ├── invoicing/page.tsx    # Invoicing
│   │   ├── ledger/page.tsx       # General Ledger
│   │   ├── audit/page.tsx        # Audit & Compliance
│   │   └── reports/page.tsx      # Reports & Analytics
│   ├── components/
│   │   ├── ui/                   # Shadcn UI primitives
│   │   ├── sidebar.tsx           # Navigation
│   │   ├── header.tsx            # Page header
│   │   └── dashboard/
│   │       └── kpi-card.tsx      # KPI widget
│   ├── data/
│   │   └── mockData.ts           # Complete mock dataset
│   ├── store/
│   │   └── useStore.ts           # Zustand stores
│   ├── types/
│   │   └── index.ts              # TypeScript types
│   └── lib/
│       └── utils.ts              # Utility functions
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .gitignore
```

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start for Contributors

```bash
# 1. Fork the repository
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/financial-management-system.git

# 3. Create a branch
git checkout -b feature/your-feature

# 4. Make changes and commit
git add .
git commit -m "feat: add new feature"

# 5. Push and create PR
git push origin feature/your-feature
```

---

## Security

See [SECURITY.md](SECURITY.md) for security policies and vulnerability reporting.

---

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Built with [Next.js](https://nextjs.org/) by Vercel
- UI components from [Shadcn UI](https://ui.shadcn.com/)
- Icons by [Lucide](https://lucide.dev/)
- Charts by [Recharts](https://recharts.org/)

---

**Happy coding! 🚀**
