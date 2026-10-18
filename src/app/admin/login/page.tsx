import type { Metadata } from 'next';
import { AdminLoginForm } from '@/components/admin/admin-login-form';

export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Restricted area. Staff access only.
        </p>
        <AdminLoginForm />
      </div>
    </div>
  );
}
