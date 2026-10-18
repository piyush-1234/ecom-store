import PDFDocument from 'pdfkit';
import { serverEnv } from '@/lib/env';
import { GST_STATE_CODES } from '@/lib/validators/address';

/**
 * GST tax invoice (PDF).
 *
 * Design notes:
 *  - Amounts are formatted with "Rs." rather than "₹". PDF base-14 fonts use
 *    WinAnsi encoding, which has no U+20B9 glyph; embedding a Unicode font would
 *    add a binary asset and a licensing question. "Rs." is unambiguous and standard
 *    on Indian invoices. The web UI still shows ₹.
 *  - CGST/SGST vs IGST is derived from the seller state vs the shipping state,
 *    because the order stores the ship state rather than pre-split tax columns.
 *  - Prices are tax-INCLUSIVE; the taxable value is derived, not added.
 */

export interface InvoiceItem {
  productName: string;
  variantLabel: string;
  hsnCode: string;
  qty: number;
  unitPricePaise: number;
  taxableValuePaise: number;
  taxPaise: number;
  taxRatePct: number;
  lineTotalPaise: number;
}

export interface InvoiceOrder {
  orderNumber: string;
  placedAt: Date;
  email: string;
  phone: string;
  paymentMethod: 'PREPAID' | 'COD';
  status: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    landmark?: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  items: InvoiceItem[];
}

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width

/** Indian-grouped currency, ASCII-safe for PDF fonts. */
export function rs(paise: number): string {
  const rupees = paise / 100;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `Rs. ${formatted}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** 18% GST on shipping / COD fee (services), extracted from a tax-inclusive amount. */
function inclusiveTax(amountPaise: number, ratePct = 18): number {
  if (amountPaise <= 0) return 0;
  return amountPaise - Math.round(amountPaise / (1 + ratePct / 100));
}

export function computeTaxSplit(order: InvoiceOrder): {
  interState: boolean;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
} {
  const env = serverEnv();
  const sellerCode = env.GST_SELLER_STATE_CODE;
  const shipCode = GST_STATE_CODES[order.shippingAddress.state] ?? sellerCode;
  const interState = sellerCode !== shipCode;

  const serviceTax = inclusiveTax(order.shippingPaise) + inclusiveTax(order.codFeePaise);
  const totalTaxPaise = order.taxPaise;

  if (interState) {
    return { interState, cgstPaise: 0, sgstPaise: 0, igstPaise: totalTaxPaise, totalTaxPaise };
  }

  const half = Math.floor(totalTaxPaise / 2);
  return {
    interState,
    cgstPaise: half,
    sgstPaise: totalTaxPaise - half,
    igstPaise: 0,
    totalTaxPaise,
  };
}

export interface InvoicePdfOptions {
  /**
   * Compress content streams. Default true (smaller invoices). Tests render with
   * compression off so the embedded text can be asserted directly — compressed
   * streams are FlateDecode, so raw text is not searchable in the bytes.
   */
  compress?: boolean;
}

export async function generateInvoicePdf(
  order: InvoiceOrder,
  options: InvoicePdfOptions = {},
): Promise<Buffer> {
  const env = serverEnv();
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    compress: options.compress ?? true,
  });
  const chunks: Buffer[] = [];

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const split = computeTaxSplit(order);

  // ---------- Header ----------
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0B0B0B').text('TAX INVOICE', {
    align: 'right',
  });
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(env.GST_LEGAL_ENTITY_NAME, PAGE_MARGIN, PAGE_MARGIN, { align: 'left' });
  doc.font('Helvetica').fontSize(9).fillColor('#444444');
  doc.text(`GSTIN: ${env.GST_GSTIN}`);
  doc.text(`State: ${env.GST_SELLER_STATE} (${env.GST_SELLER_STATE_CODE})`);
  doc.text('Made in India');

  doc.moveDown(0.5);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#0B0B0B')
    .text(`Invoice No: ${order.orderNumber}`, PAGE_MARGIN, 110)
    .text(`Invoice Date: ${formatDate(order.placedAt)}`)
    .text(`Order Status: ${order.status}`)
    .text(`Payment: ${order.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Prepaid'}`);

  // ---------- Bill to ----------
  const billTop = 110;
  const billLeft = PAGE_MARGIN + CONTENT_WIDTH / 2;
  const address = order.shippingAddress;

  doc.font('Helvetica-Bold').fontSize(9).text('BILL TO / SHIP TO', billLeft, billTop);
  doc.font('Helvetica').fontSize(9).fillColor('#222222');
  doc.text(address.fullName, billLeft, billTop + 14, { width: CONTENT_WIDTH / 2 - 4 });
  const addressLines = [
    address.line1,
    address.line2,
    address.landmark ? `Near ${address.landmark}` : null,
    `${address.city}, ${address.state} - ${address.pincode}`,
    `Phone: ${address.phone}`,
    `Email: ${order.email}`,
  ].filter(Boolean) as string[];
  for (const line of addressLines) {
    doc.text(line, { width: CONTENT_WIDTH / 2 - 4 });
  }

  // ---------- Items table ----------
  const tableTop = 230;
  const cols = {
    index: PAGE_MARGIN,
    desc: PAGE_MARGIN + 18,
    hsn: PAGE_MARGIN + 148,
    qty: PAGE_MARGIN + 188,
    rate: PAGE_MARGIN + 218,
    taxable: PAGE_MARGIN + 288,
    gst: PAGE_MARGIN + 358,
    tax: PAGE_MARGIN + 392,
    amount: PAGE_MARGIN + 446,
  };

  doc.rect(PAGE_MARGIN, tableTop, CONTENT_WIDTH, 18).fill('#0B0B0B');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
  doc.text('#', cols.index + 2, tableTop + 5, { width: 14 });
  doc.text('DESCRIPTION', cols.desc, tableTop + 5, { width: 126 });
  doc.text('HSN', cols.hsn, tableTop + 5, { width: 36 });
  doc.text('QTY', cols.qty, tableTop + 5, { width: 26 });
  doc.text('RATE', cols.rate, tableTop + 5, { width: 66, align: 'right' });
  doc.text('TAXABLE', cols.taxable, tableTop + 5, { width: 66, align: 'right' });
  doc.text('GST', cols.gst, tableTop + 5, { width: 30, align: 'right' });
  doc.text('TAX', cols.tax, tableTop + 5, { width: 50, align: 'right' });
  doc.text('AMOUNT', cols.amount, tableTop + 5, { width: 62, align: 'right' });

  let y = tableTop + 22;
  doc.font('Helvetica').fontSize(8).fillColor('#111111');

  order.items.forEach((item, index) => {
    if (y > 660) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    const label = `${item.productName} — ${item.variantLabel}`;
    doc.text(String(index + 1), cols.index + 2, y, { width: 14 });
    doc.text(label, cols.desc, y, { width: 126 });
    doc.text(item.hsnCode, cols.hsn, y, { width: 36 });
    doc.text(String(item.qty), cols.qty, y, { width: 26 });
    doc.text(rs(item.unitPricePaise), cols.rate, y, { width: 66, align: 'right' });
    doc.text(rs(item.taxableValuePaise), cols.taxable, y, { width: 66, align: 'right' });
    doc.text(`${item.taxRatePct}%`, cols.gst, y, { width: 30, align: 'right' });
    doc.text(rs(item.taxPaise), cols.tax, y, { width: 50, align: 'right' });
    doc.text(rs(item.lineTotalPaise), cols.amount, y, { width: 62, align: 'right' });

    const rowHeight = doc.heightOfString(label, { width: 126 });
    y += Math.max(rowHeight, 12) + 6;
    doc.moveTo(PAGE_MARGIN, y - 4).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y - 4).strokeColor('#DDDDDD').stroke();
  });

  // ---------- Totals ----------
  y += 6;
  const totalsLeft = PAGE_MARGIN + 300;

  const row = (label: string, value: string, bold = false): void => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#111111');
    doc.text(label, totalsLeft, y, { width: 130 });
    doc.text(value, totalsLeft + 130, y, { width: 85, align: 'right' });
    y += 14;
  };

  row('Subtotal', rs(order.subtotalPaise));
  if (order.discountPaise > 0) row('Discount', `- ${rs(order.discountPaise)}`);
  if (order.shippingPaise > 0) row('Shipping', rs(order.shippingPaise));
  if (order.codFeePaise > 0) row('COD fee', rs(order.codFeePaise));

  doc.moveTo(totalsLeft, y).lineTo(totalsLeft + 215, y).strokeColor('#0B0B0B').stroke();
  y += 6;
  row('Total (incl. GST)', rs(order.totalPaise), true);

  // ---------- Tax summary ----------
  y += 8;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0B0B0B').text('TAX SUMMARY', totalsLeft, y);
  y += 14;
  doc.font('Helvetica').fontSize(8.5);

  if (split.interState) {
    doc.text(`IGST`, totalsLeft, y, { width: 130 });
    doc.text(rs(split.igstPaise), totalsLeft + 130, y, { width: 85, align: 'right' });
    y += 13;
  } else {
    doc.text('CGST', totalsLeft, y, { width: 130 });
    doc.text(rs(split.cgstPaise), totalsLeft + 130, y, { width: 85, align: 'right' });
    y += 13;
    doc.text('SGST', totalsLeft, y, { width: 130 });
    doc.text(rs(split.sgstPaise), totalsLeft + 130, y, { width: 85, align: 'right' });
    y += 13;
  }
  doc.text('Total tax (incl. in prices)', totalsLeft, y, { width: 130 });
  doc.text(rs(split.totalTaxPaise), totalsLeft + 130, y, { width: 85, align: 'right' });

  // ---------- Footer ----------
  const footerY = 740;
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#555555')
    .text(
      'Declaration: All prices are inclusive of GST. This is a computer-generated invoice and does not require a signature. ' +
        'Goods once sold are subject to our returns and exchange policy.',
      PAGE_MARGIN,
      footerY,
      { width: CONTENT_WIDTH },
    );

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#0B0B0B')
    .text(`For ${env.GST_LEGAL_ENTITY_NAME}`, PAGE_MARGIN, footerY + 26, { width: 200 });

  doc.end();
  return finished;
}
