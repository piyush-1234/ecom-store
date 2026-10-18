import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { verifyPassword } from '@/server/auth/password';
import { createAdminSession } from '@/server/auth/admin-session';
import { clientIp, parseJson, rateLimit } from '@/server/http';
import { errorResponse, AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    rateLimit(`admin-login:${clientIp(request)}`, 8, 60_000);

    const input = await parseJson(request, schema);

    const admin = await prisma.adminUser.findUnique({ where: { email: input.email } });
    const passwordOk = await verifyPassword(input.password, admin?.passwordHash ?? null);

    // Same error for unknown email and wrong password: no enumeration.
    if (!admin || !passwordOk || !admin.isActive) {
      throw new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.', 401);
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await createAdminSession({ id: admin.id, email: admin.email, role: admin.role });

    return NextResponse.json({
      data: { admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
