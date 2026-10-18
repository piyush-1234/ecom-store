'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, FieldError } from '@/components/ui/label';
import { INDIAN_STATES } from '@/lib/validators/address';

export interface AddressDto {
  id: string;
  label: string | null;
  type: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

interface ApiError {
  error?: { message?: string; details?: { fields?: Record<string, string> } };
}

export function AddressBook({ initialAddresses }: { initialAddresses: AddressDto[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(initialAddresses.length === 0);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(undefined);
    setFields({});

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      fullName: String(data.get('fullName') ?? ''),
      phone: String(data.get('phone') ?? ''),
      line1: String(data.get('line1') ?? ''),
      line2: String(data.get('line2') ?? '') || undefined,
      landmark: String(data.get('landmark') ?? '') || undefined,
      city: String(data.get('city') ?? ''),
      state: String(data.get('state') ?? ''),
      pincode: String(data.get('pincode') ?? ''),
      type: String(data.get('type') ?? 'HOME'),
      isDefault: data.get('isDefault') === 'on',
    };

    try {
      const res = await fetch('/api/account/addresses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json()) as ApiError;
        setFormError(body.error?.message ?? 'Could not save this address.');
        setFields(body.error?.details?.fields ?? {});
        return;
      }

      form.reset();
      setShowForm(false);
      router.refresh();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function onDelete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/account/addresses/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="space-y-6">
      {initialAddresses.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">You have no saved addresses yet.</p>
      ) : null}

      <ul className="space-y-3">
        {initialAddresses.map((address) => (
          <li key={address.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm">
                <p className="font-medium">
                  {address.fullName}
                  {address.isDefault ? (
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  {address.landmark ? `, near ${address.landmark}` : ''}
                </p>
                <p className="text-muted-foreground">
                  {address.city}, {address.state} — {address.pincode}
                </p>
                <p className="mt-1 text-muted-foreground">{address.phone}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(address.id)}
                disabled={busyId === address.id}
              >
                {busyId === address.id ? 'Removing…' : 'Remove'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {showForm ? (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4" noValidate>
          <h2 className="text-sm font-semibold">Add a new address</h2>

          {formError ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" required className="mt-1.5" />
              <FieldError message={fields.fullName} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" required className="mt-1.5" />
              <FieldError message={fields.phone} />
            </div>
          </div>

          <div>
            <Label htmlFor="line1">Address line 1</Label>
            <Input id="line1" name="line1" required className="mt-1.5" />
            <FieldError message={fields.line1} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="line2">Address line 2 (optional)</Label>
              <Input id="line2" name="line2" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="landmark">Landmark (optional)</Label>
              <Input id="landmark" name="landmark" className="mt-1.5" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" required className="mt-1.5" />
              <FieldError message={fields.city} />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <select
                id="state"
                name="state"
                required
                defaultValue=""
                className="mt-1.5 flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>
                  Select
                </option>
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <FieldError message={fields.state} />
            </div>
            <div>
              <Label htmlFor="pincode">PIN code</Label>
              <Input
                id="pincode"
                name="pincode"
                inputMode="numeric"
                maxLength={6}
                required
                className="mt-1.5"
              />
              <FieldError message={fields.pincode} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" className="h-4 w-4 rounded border-input" />
            Make this my default address
          </label>

          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save address'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setShowForm(true)}>Add a new address</Button>
      )}
    </div>
  );
}
