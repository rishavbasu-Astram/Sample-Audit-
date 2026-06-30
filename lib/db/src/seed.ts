/**
 * Demo seed for local development.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @workspace/db run seed
 *
 * Dates are anchored around 2026 so the dashboard cash-flow chart (trailing 6 months)
 * and the AR/AP aging buckets are populated. Re-running is safe — it truncates first.
 */
import { pool } from "./index";

const SQL = /* sql */ `
BEGIN;

TRUNCATE customers, vendors, bank_accounts, bank_transactions, chart_of_accounts,
         assets, invoices, bills, expenses, payments_received, quotes, purchase_orders,
         journals RESTART IDENTITY CASCADE;

INSERT INTO customers (name) VALUES
  ('TechCorp Solutions'), ('Global Logistics Ltd'), ('SaaS Ventures LLC'),
  ('Healthcare Systems Inc'), ('Northwind Traders'), ('Apex Manufacturing');

INSERT INTO vendors (name) VALUES
  ('AWS Cloud Services'), ('Office Realty Group'), ('Staples Supplies'),
  ('Marketing Pros Agency'), ('LegalEdge Partners');

INSERT INTO bank_accounts (name, account_number, bank_name, account_type, currency, current_balance, is_active) VALUES
  ('Operating Account', '****4821', 'First National Bank', 'checking', 'USD', 1250000.00, true),
  ('Payroll Account',   '****7733', 'First National Bank', 'checking', 'USD',  480000.50, true),
  ('Reserve / Savings', '****9920', 'Apex Capital',         'savings',  'USD', 2300000.00, true);

INSERT INTO bank_transactions (account_id, date, type, amount, description, reference, balance) VALUES
  (1, '2026-06-10', 'credit', 130000.00, 'Client payment - TechCorp', 'PMT-006', 1250000.00),
  (1, '2026-06-12', 'debit',   50000.00, 'AWS Cloud Services',        'EXP-006', 1200000.00),
  (2, '2026-05-30', 'debit',  320000.00, 'Payroll run - May',         'PAY-005',  480000.50);

INSERT INTO chart_of_accounts (code, name, type, subtype, balance, is_active) VALUES
  ('1000', 'Cash & Bank',         'asset',     'current_asset',     4030000.00, true),
  ('1100', 'Accounts Receivable', 'asset',     'current_asset',      450000.00, true),
  ('2000', 'Accounts Payable',    'liability', 'current_liability',  210000.00, true),
  ('3000', 'Share Capital',       'equity',    'equity',            5000000.00, true),
  ('4000', 'Sales Revenue',       'revenue',   'operating_revenue',  780000.00, true),
  ('5000', 'Operating Expenses',  'expense',   'operating_expense',  346000.00, true);

INSERT INTO assets (name, asset_type, purchase_date, purchase_price, current_value, depreciation_method, status) VALUES
  ('Dell PowerEdge Servers', 'equipment',  '2024-03-15', 180000.00, 126000.00, 'straight_line', 'active'),
  ('Office Fit-out',         'furniture',  '2023-11-01',  95000.00,  66500.00, 'straight_line', 'active'),
  ('Company Vehicles (x3)',  'vehicle',    '2025-01-20', 240000.00, 192000.00, 'declining',     'active'),
  ('Software Licenses',      'intangible', '2025-06-10',  60000.00,  48000.00, 'straight_line', 'active');

INSERT INTO invoices (invoice_number, customer_id, date, due_date, status, subtotal, tax_amount, total, amount_paid, amount_due, line_items) VALUES
  ('INV-2026-0041', 1, '2026-06-20', '2026-07-20', 'sent', 125000.00, 12500.00, 137500.00,     0.00, 137500.00, '[]'),
  ('INV-2026-0042', 2, '2026-06-05', '2026-06-20', 'sent',  80000.00,  8000.00,  88000.00,     0.00,  88000.00, '[]'),
  ('INV-2026-0043', 3, '2026-05-01', '2026-05-15', 'sent',  45000.00,  4500.00,  49500.00,     0.00,  49500.00, '[]'),
  ('INV-2026-0044', 4, '2026-04-05', '2026-04-20', 'sent',  60000.00,  6000.00,  66000.00,     0.00,  66000.00, '[]'),
  ('INV-2026-0045', 5, '2026-02-01', '2026-02-10', 'sent',  30000.00,  3000.00,  33000.00,     0.00,  33000.00, '[]'),
  ('INV-2026-0046', 6, '2026-06-15', '2026-07-15', 'paid',  75000.00,  7500.00,  82500.00, 82500.00,      0.00, '[]'),
  ('INV-2026-0047', 1, '2026-05-22', '2026-06-22', 'paid',  52000.00,  5200.00,  57200.00, 57200.00,      0.00, '[]');

INSERT INTO bills (bill_number, vendor_id, date, due_date, status, subtotal, tax_amount, total, amount_paid, amount_due, line_items) VALUES
  ('BILL-2026-0021', 1, '2026-06-12', '2026-07-12', 'open', 50000.00, 5000.00, 55000.00,     0.00, 55000.00, '[]'),
  ('BILL-2026-0022', 2, '2026-06-01', '2026-06-16', 'open', 28000.00, 2800.00, 30800.00,     0.00, 30800.00, '[]'),
  ('BILL-2026-0023', 3, '2026-05-10', '2026-05-25', 'open', 12000.00, 1200.00, 13200.00,     0.00, 13200.00, '[]'),
  ('BILL-2026-0024', 4, '2026-04-18', '2026-05-03', 'open', 40000.00, 4000.00, 44000.00,     0.00, 44000.00, '[]'),
  ('BILL-2026-0025', 5, '2026-06-20', '2026-07-20', 'paid', 18000.00, 1800.00, 19800.00, 19800.00,     0.00, '[]');

INSERT INTO expenses (vendor_id, date, category, amount, tax_amount, total, payment_method, reference) VALUES
  (1, '2026-01-18', 'Cloud Infrastructure', 60000.00, 0.00, 60000.00, 'bank_transfer', 'EXP-001'),
  (3, '2026-02-14', 'Office Supplies',       45000.00, 0.00, 45000.00, 'card',          'EXP-002'),
  (4, '2026-03-09', 'Marketing',             72000.00, 0.00, 72000.00, 'bank_transfer', 'EXP-003'),
  (5, '2026-04-25', 'Legal & Professional',  38000.00, 0.00, 38000.00, 'bank_transfer', 'EXP-004'),
  (2, '2026-05-30', 'Rent',                  81000.00, 0.00, 81000.00, 'bank_transfer', 'EXP-005'),
  (1, '2026-06-12', 'Cloud Infrastructure',  50000.00, 0.00, 50000.00, 'bank_transfer', 'EXP-006');

INSERT INTO payments_received (customer_id, date, amount, payment_method, reference, invoice_id) VALUES
  (1, '2026-01-12', 120000.00, 'bank_transfer', 'PMT-001', NULL),
  (2, '2026-02-08',  95000.00, 'bank_transfer', 'PMT-002', NULL),
  (3, '2026-03-20', 150000.00, 'card',          'PMT-003', NULL),
  (4, '2026-04-15', 110000.00, 'bank_transfer', 'PMT-004', NULL),
  (5, '2026-05-22', 175000.00, 'bank_transfer', 'PMT-005', NULL),
  (6, '2026-06-10', 130000.00, 'bank_transfer', 'PMT-006', 6);

INSERT INTO quotes (quote_number, customer_id, date, expiry_date, status, subtotal, tax_amount, total, line_items) VALUES
  ('QT-2026-0011', 2, '2026-06-18', '2026-07-18', 'sent',  90000.00, 9000.00, 99000.00, '[]'),
  ('QT-2026-0012', 5, '2026-06-25', '2026-07-25', 'draft', 42000.00, 4200.00, 46200.00, '[]');

INSERT INTO purchase_orders (po_number, vendor_id, date, expected_date, status, subtotal, tax_amount, total, line_items) VALUES
  ('PO-2026-0007', 1, '2026-06-22', '2026-07-05', 'approved', 65000.00, 6500.00, 71500.00, '[]'),
  ('PO-2026-0008', 3, '2026-06-28', '2026-07-10', 'sent',     15000.00, 1500.00, 16500.00, '[]');

INSERT INTO journals (journal_number, date) VALUES
  ('JE-2026-0001', '2026-06-01'),
  ('JE-2026-0002', '2026-06-15');

COMMIT;
`;

async function main(): Promise<void> {
  await pool.query(SQL);
  console.log("Seed complete — demo data loaded.");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
