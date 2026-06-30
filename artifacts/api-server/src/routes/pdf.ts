import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import {
  db,
  invoicesTable,
  customersTable,
  billsTable,
  vendorsTable,
} from "@workspace/db";

const router: IRouter = Router();

const BRAND_DARK = "#1e293b";
const BRAND_ACCENT = "#2563eb";
const ORANGE = "#ea580c";
const GRAY_500 = "#6b7280";
const GRAY_200 = "#e5e7eb";
const GREEN = "#16a34a";
const RED = "#dc2626";

type LineItem = {
  description?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  taxRate?: number;
};

type Party = {
  name: string;
  company?: string | null;
  email?: string | null;
  address?: string | null;
};

type DocMeta = {
  docType: "INVOICE" | "BILL";
  accentColor: string;
  docNumber: string;
  date: string;
  dueDate: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  notes?: string | null;
  party: Party;
  partyLabel: string;
  lineItems: LineItem[];
  filename: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return s;
  }
}

function renderDoc(res: import("express").Response, meta: DocMeta): void {
  const {
    docType, accentColor, docNumber, date, dueDate, status,
    subtotal, taxAmount, total, amountPaid, amountDue,
    notes, party, partyLabel, lineItems, filename,
  } = meta;

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  // Header accent bar
  doc.rect(0, 0, doc.page.width, 8).fill(accentColor);

  // Company name
  doc.fontSize(26).font("Helvetica-Bold").fillColor(BRAND_DARK).text("ASTRAM", 50, 30);
  doc.fontSize(9).font("Helvetica").fillColor(GRAY_500).text("Financial Management Portal", 50, 60);

  // Document type title (top-right)
  doc.fontSize(32).font("Helvetica-Bold").fillColor(accentColor).text(docType, 0, 30, { align: "right" });

  // Status
  const statusColor =
    status === "paid" ? GREEN :
    status === "overdue" ? RED :
    status === "sent" || status === "approved" ? accentColor :
    GRAY_500;
  doc.fontSize(10).font("Helvetica-Bold").fillColor(statusColor).text(status.toUpperCase(), 0, 70, { align: "right" });

  // Divider
  doc.moveTo(50, 90).lineTo(doc.page.width - 50, 90).strokeColor(GRAY_200).lineWidth(1).stroke();

  // Meta block (left)
  const metaTop = 108;
  const docLabel = docType === "INVOICE" ? "INVOICE NUMBER" : "BILL NUMBER";

  doc.fontSize(8).font("Helvetica-Bold").fillColor(GRAY_500).text(docLabel, 50, metaTop);
  doc.fontSize(10).font("Helvetica").fillColor(BRAND_DARK).text(docNumber, 50, metaTop + 13);

  doc.fontSize(8).font("Helvetica-Bold").fillColor(GRAY_500).text("DATE ISSUED", 50, metaTop + 35);
  doc.fontSize(10).font("Helvetica").fillColor(BRAND_DARK).text(fmtDate(date), 50, metaTop + 48);

  doc.fontSize(8).font("Helvetica-Bold").fillColor(GRAY_500).text("DUE DATE", 50, metaTop + 70);
  doc.fontSize(10).font("Helvetica").fillColor(BRAND_DARK).text(fmtDate(dueDate), 50, metaTop + 83);

  // Party block (right)
  const partyX = 320;
  doc.fontSize(8).font("Helvetica-Bold").fillColor(GRAY_500).text(partyLabel, partyX, metaTop);
  doc.fontSize(12).font("Helvetica-Bold").fillColor(BRAND_DARK).text(party.name, partyX, metaTop + 13);

  let partyOffset = 29;
  if (party.company) {
    doc.fontSize(10).font("Helvetica").fillColor(GRAY_500).text(party.company, partyX, metaTop + partyOffset);
    partyOffset += 15;
  }
  if (party.email) {
    doc.fontSize(9).font("Helvetica").fillColor(GRAY_500).text(party.email, partyX, metaTop + partyOffset);
    partyOffset += 13;
  }
  if (party.address) {
    doc.fontSize(9).font("Helvetica").fillColor(GRAY_500).text(party.address, partyX, metaTop + partyOffset, { width: 220 });
  }

  // Line items table
  const tableTop = 240;
  const colX = { desc: 50, qty: 310, rate: 380, tax: 450, amount: 490 };

  doc.rect(50, tableTop, doc.page.width - 100, 20).fill(BRAND_DARK);
  doc
    .fontSize(8).font("Helvetica-Bold").fillColor("#ffffff")
    .text("DESCRIPTION", colX.desc + 4, tableTop + 6)
    .text("QTY", colX.qty, tableTop + 6, { width: 60, align: "center" })
    .text("RATE", colX.rate, tableTop + 6, { width: 60, align: "right" })
    .text("TAX %", colX.tax, tableTop + 6, { width: 40, align: "right" })
    .text("AMOUNT", colX.amount, tableTop + 6, { width: 60, align: "right" });

  let rowY = tableTop + 20;
  const rowHeight = 22;

  lineItems.forEach((item, i) => {
    doc.rect(50, rowY, doc.page.width - 100, rowHeight).fill(i % 2 === 0 ? "#f8fafc" : "#ffffff");
    doc
      .fontSize(9).font("Helvetica").fillColor(BRAND_DARK)
      .text(item.description ?? "—", colX.desc + 4, rowY + 7, { width: 250 })
      .text(String(item.quantity ?? 1), colX.qty, rowY + 7, { width: 60, align: "center" })
      .text(fmt(item.rate ?? 0), colX.rate, rowY + 7, { width: 60, align: "right" })
      .text(`${item.taxRate ?? 0}%`, colX.tax, rowY + 7, { width: 40, align: "right" })
      .text(fmt(item.amount ?? 0), colX.amount, rowY + 7, { width: 60, align: "right" });
    rowY += rowHeight;
  });

  doc.moveTo(50, rowY).lineTo(doc.page.width - 50, rowY).strokeColor(GRAY_200).lineWidth(0.5).stroke();

  // Totals
  const totalsX = 370;
  let totY = rowY + 16;

  const totalsRow = (label: string, value: string, bold = false, color = BRAND_DARK) => {
    doc
      .fontSize(9).font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(GRAY_500)
      .text(label, totalsX, totY, { width: 100, align: "right" })
      .fillColor(color).font(bold ? "Helvetica-Bold" : "Helvetica")
      .text(value, totalsX + 108, totY, { width: 72, align: "right" });
    totY += 16;
  };

  totalsRow("Subtotal", fmt(subtotal));
  totalsRow("Tax", fmt(taxAmount));
  doc.moveTo(totalsX, totY).lineTo(doc.page.width - 50, totY).strokeColor(GRAY_200).lineWidth(0.5).stroke();
  totY += 8;
  totalsRow("Total", fmt(total), true);

  if (amountPaid > 0) {
    totalsRow("Amount Paid", fmt(amountPaid), false, GREEN);
    doc.moveTo(totalsX, totY).lineTo(doc.page.width - 50, totY).strokeColor(GRAY_200).lineWidth(0.5).stroke();
    totY += 8;
    totalsRow("Balance Due", fmt(amountDue), true, amountDue > 0 ? RED : GREEN);
  }

  if (amountDue > 0) {
    const boxColor = docType === "BILL" ? "#fff7ed" : "#fef2f2";
    const textColor = docType === "BILL" ? ORANGE : RED;
    doc.rect(totalsX - 10, totY + 4, doc.page.width - totalsX - 40, 28).fill(boxColor);
    doc
      .fontSize(11).font("Helvetica-Bold").fillColor(textColor)
      .text(`Amount Due: ${fmt(amountDue)}`, totalsX, totY + 11, {
        width: doc.page.width - totalsX - 50,
        align: "right",
      });
  }

  // Notes
  if (notes) {
    const notesY = Math.max(totY + 60, rowY + 120);
    doc.fontSize(8).font("Helvetica-Bold").fillColor(GRAY_500).text("NOTES", 50, notesY);
    doc.fontSize(9).font("Helvetica").fillColor(BRAND_DARK).text(notes, 50, notesY + 13, { width: 400 });
  }

  // Footer
  const footerY = doc.page.height - 60;
  doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).strokeColor(GRAY_200).lineWidth(0.5).stroke();
  doc.fontSize(8).font("Helvetica").fillColor(GRAY_500).text(
    docType === "INVOICE" ? "Thank you for your business." : "Please remit payment by the due date.",
    50, footerY + 10, { align: "center" }
  );
  doc.fontSize(7).fillColor(GRAY_500).text(
    `Generated by Astram Financial Portal  •  ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    50, footerY + 24, { align: "center" }
  );

  doc.end();
}

// ── INVOICE PDF ───────────────────────────────────────────────────────────────
router.get("/invoices/:id/pdf", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, invoice.customerId));

  renderDoc(res, {
    docType: "INVOICE",
    accentColor: BRAND_ACCENT,
    docNumber: invoice.invoiceNumber,
    date: invoice.date,
    dueDate: invoice.dueDate,
    status: invoice.status,
    subtotal: parseFloat(String(invoice.subtotal)),
    taxAmount: parseFloat(String(invoice.taxAmount)),
    total: parseFloat(String(invoice.total)),
    amountPaid: parseFloat(String(invoice.amountPaid)),
    amountDue: parseFloat(String(invoice.amountDue)),
    notes: invoice.notes,
    party: {
      name: customer?.name ?? "Customer",
      company: customer?.company,
      email: customer?.email,
      address: customer?.address,
    },
    partyLabel: "BILL TO",
    lineItems: (invoice.lineItems as LineItem[]) ?? [],
    filename: `invoice-${invoice.invoiceNumber}.pdf`,
  });
});

// ── BILL PDF ──────────────────────────────────────────────────────────────────
router.get("/bills/:id/pdf", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, bill.vendorId));

  renderDoc(res, {
    docType: "BILL",
    accentColor: ORANGE,
    docNumber: bill.billNumber,
    date: bill.date,
    dueDate: bill.dueDate,
    status: bill.status,
    subtotal: parseFloat(String(bill.subtotal)),
    taxAmount: parseFloat(String(bill.taxAmount)),
    total: parseFloat(String(bill.total)),
    amountPaid: parseFloat(String(bill.amountPaid)),
    amountDue: parseFloat(String(bill.amountDue)),
    notes: bill.notes,
    party: {
      name: vendor?.name ?? "Vendor",
      company: vendor?.company,
      email: vendor?.email,
      address: vendor?.address,
    },
    partyLabel: "FROM VENDOR",
    lineItems: (bill.lineItems as LineItem[]) ?? [],
    filename: `bill-${bill.billNumber}.pdf`,
  });
});

export default router;
