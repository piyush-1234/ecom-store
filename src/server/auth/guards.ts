import { getCurrentAdmin, type AdminPayload } from '@/server/auth/admin-session';
import { AppError } from '@/server/errors';

/**
 * Admin guard for Server Actions and pages.
 * Throws (rather than redirecting) so actions fail loudly and the layout handles UX.
 */
export async function requireAdmin(roles: AdminPayload['role'][] = ['ADMIN', 'OPS']): Promise<AdminPayload> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new AppError('UNAUTHENTICATED', 'Admin sign-in required.', 401);
  }
  if (!roles.includes(admin.role)) {
    throw new AppError('FORBIDDEN', 'You do not have access to this action.', 403);
  }
  return admin;
}

export function isAdmin(payload: AdminPayload | null): payload is AdminPayload {
  return payload !== null;
}
