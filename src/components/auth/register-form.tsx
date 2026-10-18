'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, FieldError } from '@/components/ui/label';

interface ApiError {
  error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } };
}

export function RegisterForm() {
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
          // Optional: empty string must not be sent, or Zod rejects the phone.
          ...(String(data.get('phone') ?? '').trim()
            ? { phone: String(data.get('phone')) }
            : {}),
          marketingOptIn: data.get('marketingOptIn') === 'on',
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as ApiError;
        setFormError(body.error?.message ?? 'Could not create your account.');
        setFields(body.error?.details?.fields ?? {});
        return;
      }

      router.push('/account');
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
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" autoComplete="name" required className="mt-1.5" />
        <FieldError message={fields.name} />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fields.email)}
          className="mt-1.5"
        />
        <FieldError message={fields.email} />
      </div>

      <div>
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="98765 43210"
          aria-invalid={Boolean(fields.phone)}
          className="mt-1.5"
        />
        <FieldError message={fields.phone} />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="password-hint"
          aria-invalid={Boolean(fields.password)}
          className="mt-1.5"
        />
        <p id="password-hint" className="mt-1 text-xs text-muted-foreground">
          At least 8 characters, with a letter and a number.
        </p>
        <FieldError message={fields.password} />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="marketingOptIn" className="mt-1 h-4 w-4 rounded border-input" />
        <span>Send me occasional drops and fit tips.</span>
      </label>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
