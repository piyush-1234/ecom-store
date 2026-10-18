'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, FieldError } from '@/components/ui/label';

interface ApiError {
  error?: { message?: string; details?: { fields?: Record<string, string> } };
}

export function AdminLoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(undefined);
    setFields({});

    const data = new FormData(event.currentTarget);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as ApiError;
        setFormError(body.error?.message ?? 'Could not sign in.');
        setFields(body.error?.details?.fields ?? {});
        return;
      }

      router.push('/admin/orders');
      router.refresh();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div>
        <Label htmlFor="email">Admin email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required className="mt-1.5" />
        <FieldError message={fields.email} />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5"
        />
        <FieldError message={fields.password} />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in to admin'}
      </Button>
    </form>
  );
}
