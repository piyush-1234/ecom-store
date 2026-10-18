'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { placeOrderAction, type CheckoutState } from '@/server/actions/checkout';
import { INDIAN_STATES } from '@/lib/validators/address';
import { Input } from '@/components/ui/input';
import { Label, FieldError } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Serviceability {
  serviceable: boolean;
  codAllowed: boolean;
  etaDaysMin: number;
  etaDaysMax: number;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending || disabled}>
      {pending ? 'Placing order…' : 'Place order'}
    </Button>
  );
}

const initial: CheckoutState = { ok: true };

export function CheckoutForm({ razorpayEnabled }: { razorpayEnabled: boolean }) {
  const [state, formAction] = useFormState(placeOrderAction, initial);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'PREPAID'>('COD');
  const [pincode, setPincode] = useState('');
  const [serviceability, setServiceability] = useState<Serviceability | null>(null);
  const [checking, setChecking] = useState(false);

  // One key per form mount: a retried submit returns the same order.
  const [idempotencyKey] = useState(
    () => `ck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  );

  async function checkPincode() {
    if (!/^[1-9]\d{5}$/.test(pincode)) {
      setServiceability(null);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`/api/checkout/pincode?pincode=${encodeURIComponent(pincode)}`);
      const body = (await res.json()) as { data?: Serviceability; error?: { message?: string } };
      setServiceability(body.data ?? null);
    } catch {
      setServiceability(null);
    } finally {
      setChecking(false);
    }
  }

  const fields = state.fields ?? {};

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {state.message ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1.5" />
            <FieldError message={fields.email} />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" required className="mt-1.5" />
            <FieldError message={fields.phone} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Shipping address</h2>

        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required className="mt-1.5" />
          <FieldError message={fields['address.fullName']} />
        </div>

        <div>
          <Label htmlFor="line1">Address line 1</Label>
          <Input id="line1" name="line1" autoComplete="address-line1" required className="mt-1.5" />
          <FieldError message={fields['address.line1']} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="line2">Address line 2 (optional)</Label>
            <Input id="line2" name="line2" autoComplete="address-line2" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="landmark">Landmark (optional)</Label>
            <Input id="landmark" name="landmark" className="mt-1.5" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" autoComplete="address-level2" required className="mt-1.5" />
            <FieldError message={fields['address.city']} />
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
              {INDIAN_STATES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <FieldError message={fields['address.state']} />
          </div>
          <div>
            <Label htmlFor="pincode">PIN code</Label>
            <Input
              id="pincode"
              name="pincode"
              inputMode="numeric"
              maxLength={6}
              autoComplete="postal-code"
              required
              value={pincode}
              onChange={(event) => {
                setPincode(event.target.value);
                setServiceability(null);
              }}
              onBlur={checkPincode}
              className="mt-1.5"
            />
            <FieldError message={fields['address.pincode']} />
            {checking ? <p className="mt-1 text-xs text-muted-foreground">Checking…</p> : null}
            {serviceability ? (
              serviceability.serviceable ? (
                <p className="mt-1 text-xs text-accent">
                  Delivers in {serviceability.etaDaysMin}–{serviceability.etaDaysMax} days
                  {serviceability.codAllowed ? '' : ' · prepaid only'}
                </p>
              ) : (
                <p className="mt-1 text-xs text-destructive">We cannot deliver to this PIN code yet.</p>
              )
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Coupon</h2>
        <div>
          <Label htmlFor="couponCode">Coupon code (optional)</Label>
          <Input
            id="couponCode"
            name="couponCode"
            placeholder="WELCOME10"
            autoComplete="off"
            className="mt-1.5 uppercase placeholder:normal-case"
          />
          <FieldError message={fields.couponCode} />
          <p className="mt-1 text-xs text-muted-foreground">
            Applied on submit — the order total will confirm it.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Payment</h2>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
          <input
            type="radio"
            name="paymentMethod"
            value="COD"
            checked={paymentMethod === 'COD'}
            onChange={() => setPaymentMethod('COD')}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm">
            <span className="font-medium">Cash on delivery</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              A small COD fee applies. Pay the courier when it arrives.
            </span>
          </span>
        </label>

        <label
          className={`flex items-start gap-3 rounded-md border border-border p-3 ${
            razorpayEnabled ? 'cursor-pointer' : 'opacity-50'
          }`}
        >
          <input
            type="radio"
            name="paymentMethod"
            value="PREPAID"
            checked={paymentMethod === 'PREPAID'}
            onChange={() => setPaymentMethod('PREPAID')}
            disabled={!razorpayEnabled}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm">
            <span className="font-medium">UPI / card / netbanking</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {razorpayEnabled
                ? 'Secure payment via Razorpay. ₹50 off for prepaid orders.'
                : 'Not enabled yet — coming soon.'}
            </span>
          </span>
        </label>
      </section>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="acceptTerms" className="mt-1 h-4 w-4 rounded border-input" />
        <span>
          I accept the terms of sale and the{' '}
          <Link href="/size-chart" className="text-accent underline-offset-4 hover:underline">
            size chart
          </Link>{' '}
          guidance. Exchanges are free within 7 days.
        </span>
      </label>
      <FieldError message={fields.acceptTerms} />

      <SubmitButton disabled={false} />
    </form>
  );
}
