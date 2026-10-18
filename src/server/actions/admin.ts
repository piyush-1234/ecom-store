'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/server/auth/guards';
import { destroyAdminSession } from '@/server/auth/admin-session';
import {
  approveReturn,
  cancelReturn,
  completeExchange,
  completeRefund,
  markReturnReceived,
  rejectReturn,
  shipReplacement,
} from '@/server/services/returns.service';
import { cancelOrder, markOrderPacked } from '@/server/services/admin-orders.service';
import { AppError } from '@/server/errors';

/**
 * Admin Server Actions.
 *
 * Every action re-checks the admin session — a form post must never be trusted to
 * carry authority. Errors are surfaced as a redirect query flag rather than a silent
 * failure, so the UI can show what happened.
 */

function backWith(path: string, params: Record<string, string> = {}): never {
  const query = new URLSearchParams(params).toString();
  redirect(`${path}${query ? `?${query}` : ''}`);
}

async function run(
  path: string,
  work: () => Promise<unknown>,
): Promise<never> {
  try {
    await work();
    revalidatePath(path);
    revalidatePath('/admin/returns');
    revalidatePath('/admin/orders');
    backWith(path, { ok: '1' });
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Action failed.';
    if (!(error instanceof AppError)) console.error('[admin action]', error);
    backWith(path, { error: message });
  }
}

export async function logoutAdminAction(): Promise<void> {
  await destroyAdminSession();
  redirect('/admin/login');
}

export async function approveReturnAction(formData: FormData): Promise<never> {
  const id = String(formData.get('returnId') ?? '');
  return run('/admin/returns', async () => {
    const admin = await requireAdmin();
    await approveReturn(id, admin.sub);
  });
}

export async function rejectReturnAction(formData: FormData): Promise<never> {
  const id = String(formData.get('returnId') ?? '');
  const reason = formData.get('reason') ? String(formData.get('reason')) : undefined;
  return run('/admin/returns', async () => {
    const admin = await requireAdmin();
    await rejectReturn(id, admin.sub, reason);
  });
}

export async function receivedReturnAction(formData: FormData): Promise<never> {
  const id = String(formData.get('returnId') ?? '');
  return run('/admin/returns', async () => {
    const admin = await requireAdmin();
    await markReturnReceived(id, admin.sub);
  });
}

export async function refundReturnAction(formData: FormData): Promise<never> {
  const id = String(formData.get('returnId') ?? '');
  return run('/admin/returns', async () => {
    const admin = await requireAdmin();
    await completeRefund(id, admin.sub);
  });
}

export async function shipReplacementAction(formData: FormData): Promise<never> {
  const id = String(formData.get('returnId') ?? '');
  return run('/admin/returns', async () => {
    const admin = await requireAdmin();
    await shipReplacement(id, admin.sub);
  });
}

export async function completeExchangeAction(formData: FormData): Promise<never> {
  const id = String(formData.get('returnId') ?? '');
  return run('/admin/returns', async () => {
    const admin = await requireAdmin();
    await completeExchange(id, admin.sub);
  });
}

export async function cancelReturnAction(formData: FormData): Promise<never> {
  const id = String(formData.get('returnId') ?? '');
  return run('/admin/returns', async () => {
    const admin = await requireAdmin();
    await cancelReturn(id, admin.sub);
  });
}

export async function markPackedAction(formData: FormData): Promise<never> {
  const orderNumber = String(formData.get('orderNumber') ?? '');
  return run(`/admin/orders/${orderNumber}`, async () => {
    const admin = await requireAdmin();
    await markOrderPacked(orderNumber, admin.sub);
  });
}

export async function cancelOrderAction(formData: FormData): Promise<never> {
  const orderNumber = String(formData.get('orderNumber') ?? '');
  return run(`/admin/orders/${orderNumber}`, async () => {
    const admin = await requireAdmin();
    await cancelOrder(orderNumber, admin.sub);
  });
}
