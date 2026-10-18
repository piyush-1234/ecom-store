import { siteUrl } from '@/server/email/provider';
import { getEmailProvider } from '@/server/email/provider';
import type { OrderSummary } from '@/server/services/checkout.service';
import { invoicePath } from '@/server/invoice/token';
import { formatINR } from '@/lib/utils/money';
import { siteConfig } from '@/lib/config/site';

/**
 * Order emails. Kept separate from the transport so templates can be tested and
 * the provider swapped (console in dev, Resend in production).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendOrderConfirmation(order: OrderSummary): Promise<void> {
  const provider = getEmailProvider();
  const base = siteUrl();
  const invoiceUrl = `${base}${invoicePath(order.orderNumber)}`;
  const orderUrl = `${base}/order/${order.orderNumber}?token=${invoicePath(order.orderNumber).split('token=')[1]}`;

  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">
          <strong>${escapeHtml(item.productName)}</strong><br />
          <span style="color:#666;font-size:12px">${escapeHtml(item.variantLabel)} · Qty ${item.qty}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatINR(item.lineTotalPaise)}</td>
      </tr>`,
    )
    .join('');

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0B0B0B">
    <h1 style="font-size:20px;margin:0 0 4px">Order confirmed</h1>
    <p style="color:#666;margin:0 0 20px">Thanks — we're packing order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${itemRows}
      <tr>
        <td style="padding:12px 0 4px;color:#666">Subtotal</td>
        <td style="padding:12px 0 4px;text-align:right">${formatINR(order.subtotalPaise)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#666">Shipping</td>
        <td style="padding:4px 0;text-align:right">${order.shippingPaise === 0 ? 'Free' : formatINR(order.shippingPaise)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0 0;font-weight:600">Total (incl. GST)</td>
        <td style="padding:8px 0 0;text-align:right;font-weight:600">${formatINR(order.totalPaise)}</td>
      </tr>
    </table>

    <p style="margin:20px 0 8px">
      <a href="${orderUrl}" style="display:inline-block;background:#0B0B0B;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">
        Track your order
      </a>
    </p>
    <p style="font-size:13px;color:#666">
      <a href="${invoiceUrl}" style="color:#5F6F3E">Download your GST invoice (PDF)</a>
    </p>

    <p style="font-size:12px;color:#888;margin-top:24px">
      ${escapeHtml(siteConfig.name)} · Questions? Reply to this email or write to ${escapeHtml(siteConfig.supportEmail)}.
      Prices include GST. Free size exchange within 7 days.
    </p>
  </div>`;

  await provider.send({
    to: order.email,
    subject: `Order ${order.orderNumber} confirmed — ${siteConfig.name}`,
    html,
    text: `Order ${order.orderNumber} confirmed. Total ${formatINR(order.totalPaise)}. Track: ${orderUrl}`,
  });
}
