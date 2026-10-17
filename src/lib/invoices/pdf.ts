import PDFDocument from "pdfkit";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import {
  formatInvoiceQuantity,
  type InvoiceLineUnit,
} from "@/lib/invoices/units";

export type InvoicePdfLine = {
  description: string;
  quantity: number | string;
  unit?: InvoiceLineUnit | null;
  unitPrice: number | string;
  amount: number;
};

export type InvoicePdfInput = {
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  notes: string | null;
  fromName: string;
  fromAddress: string | null;
  fromEmail: string | null;
  taxId: string | null;
  showTaxId?: boolean;
  billToName: string | null;
  billToCompany: string | null;
  billToEmail: string | null;
  lines: InvoicePdfLine[];
  subtotal: number;
  taxEnabled: boolean;
  taxRate: number;
  taxTotal: number;
  total: number;
  pricesIncludeTax?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: input.number ? `Invoice ${input.number}` : "Invoice",
        Author: input.fromName,
        Creator: "Rebban",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const accent = "#2563EB";
    const ink = "#1A1D23";
    const muted = "#6B7280";
    const rule = "#E2E5EA";
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.page.margins.top;

    // Header bar accent
    doc.rect(0, 0, doc.page.width, 6).fill(accent);

    // From / Invoice header
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(18).text(input.fromName, 48, y, {
      width: pageWidth * 0.55,
    });
    const headerBottom = doc.y;

    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(9)
      .text("INVOICE", 48 + pageWidth * 0.55, y, {
        width: pageWidth * 0.45,
        align: "right",
      });
    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(input.number || "Invoice", 48 + pageWidth * 0.55, y + 14, {
        width: pageWidth * 0.45,
        align: "right",
      });

    y = Math.max(headerBottom, doc.y) + 8;

    if (input.fromAddress) {
      doc.fillColor(muted).font("Helvetica").fontSize(9).text(input.fromAddress, 48, y, {
        width: pageWidth * 0.55,
      });
      y = doc.y + 2;
    }
    if (input.fromEmail) {
      doc.fillColor(muted).font("Helvetica").fontSize(9).text(input.fromEmail, 48, y);
      y = doc.y + 2;
    }

    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(9)
      .text(`Issued ${formatDate(input.issueDate)}`, 48 + pageWidth * 0.55, headerBottom + 8, {
        width: pageWidth * 0.45,
        align: "right",
      });
    doc.text(`Due ${formatDate(input.dueDate)}`, 48 + pageWidth * 0.55, doc.y + 2, {
      width: pageWidth * 0.45,
      align: "right",
    });

    y = Math.max(y, doc.y) + 20;
    doc
      .moveTo(48, y)
      .lineTo(48 + pageWidth, y)
      .strokeColor(rule)
      .lineWidth(1)
      .stroke();
    y += 18;

    // Bill to
    const billTo =
      input.billToCompany &&
      input.billToName &&
      input.billToCompany !== input.billToName
        ? input.billToCompany
        : input.billToCompany || input.billToName || "—";

    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("BILL TO", 48, y);
    y = doc.y + 6;
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(11).text(billTo, 48, y);
    y = doc.y + 2;
    if (
      input.billToCompany &&
      input.billToName &&
      input.billToCompany !== input.billToName
    ) {
      doc.fillColor(muted).font("Helvetica").fontSize(9).text(input.billToName, 48, y);
      y = doc.y + 2;
    }
    if (input.billToEmail) {
      doc.fillColor(muted).font("Helvetica").fontSize(9).text(input.billToEmail, 48, y);
      y = doc.y + 2;
    }

    y += 18;

    // Table header
    const colDesc = 48;
    const colQty = 48 + pageWidth * 0.52;
    const colRate = 48 + pageWidth * 0.66;
    const colAmt = 48 + pageWidth * 0.82;
    const rowH = 22;

    doc.roundedRect(48, y, pageWidth, rowH, 4).fill("#FAFBFC");
    doc
      .fillColor(muted)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("DESCRIPTION", colDesc + 8, y + 7, { width: pageWidth * 0.48 })
      .text("QTY", colQty, y + 7, { width: pageWidth * 0.12, align: "right" })
      .text(
        input.taxEnabled
          ? input.pricesIncludeTax
            ? "RATE (INCL.)"
            : "RATE (EXCL.)"
          : "RATE",
        colRate,
        y + 7,
        { width: pageWidth * 0.14, align: "right" }
      )
      .text("AMOUNT", colAmt, y + 7, { width: pageWidth * 0.16, align: "right" });
    y += rowH;

    for (const line of input.lines) {
      const descHeight = doc.heightOfString(line.description || "Item", {
        width: pageWidth * 0.48,
      });
      const thisRow = Math.max(rowH, descHeight + 12);
      if (y + thisRow > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc
        .fillColor(ink)
        .font("Helvetica")
        .fontSize(9)
        .text(line.description || "Item", colDesc + 8, y + 6, {
          width: pageWidth * 0.48,
        });
      const textY = y + 6;
      doc
        .fillColor(muted)
        .text(formatInvoiceQuantity(line.quantity, line.unit), colQty, textY, {
          width: pageWidth * 0.12,
          align: "right",
        })
        .text(
          formatInvoiceMoney(Number(line.unitPrice) || 0, input.currency),
          colRate,
          textY,
          { width: pageWidth * 0.14, align: "right" }
        )
        .fillColor(ink)
        .font("Helvetica-Bold")
        .text(formatInvoiceMoney(line.amount, input.currency), colAmt, textY, {
          width: pageWidth * 0.16,
          align: "right",
        });
      y += thisRow;
      doc
        .moveTo(48, y)
        .lineTo(48 + pageWidth, y)
        .strokeColor(rule)
        .lineWidth(0.5)
        .stroke();
    }

    y += 16;
    const totalsX = 48 + pageWidth * 0.55;
    const totalsW = pageWidth * 0.45;

    function totalRow(label: string, value: string, bold = false) {
      doc
        .fillColor(muted)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .text(label, totalsX, y, { width: totalsW * 0.45 });
      doc
        .fillColor(ink)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .text(value, totalsX + totalsW * 0.45, y, {
          width: totalsW * 0.55,
          align: "right",
        });
      y += 16;
    }

    totalRow("Subtotal", formatInvoiceMoney(input.subtotal, input.currency));
    if (input.taxEnabled) {
      totalRow(
        `Tax${input.taxRate ? ` (${input.taxRate}%)` : ""}`,
        formatInvoiceMoney(input.taxTotal, input.currency)
      );
    }
    doc
      .moveTo(totalsX, y)
      .lineTo(48 + pageWidth, y)
      .strokeColor(rule)
      .stroke();
    y += 8;
    totalRow("Total", formatInvoiceMoney(input.total, input.currency), true);

    if (input.notes?.trim()) {
      y += 16;
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("NOTES", 48, y);
      y = doc.y + 6;
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(9)
        .text(input.notes.trim(), 48, y, { width: pageWidth });
    }

    // Footer
    const footerY = doc.page.height - 48;
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(8)
      .text(
        [
          input.fromName,
          input.showTaxId && input.taxId ? `Tax ID ${input.taxId}` : null,
          "Paid via Rebban",
        ]
          .filter(Boolean)
          .join(" · "),
        48,
        footerY,
        { width: pageWidth, align: "center" }
      );

    doc.end();
  });
}
