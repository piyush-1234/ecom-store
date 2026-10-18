import { prisma } from '@/server/db/client';
import { AppError } from '@/server/errors';
import type { AddressInput, AddressUpdateInput } from '@/lib/validators/address';

/**
 * Address book.
 *
 * Every operation is scoped by `userId`, so one customer can never read or mutate
 * another customer's address by guessing an id. `updateMany`/`deleteMany` with a
 * compound where clause is used instead of `update` on a bare id for exactly this
 * reason — the wrong call shape is how IDOR bugs get introduced.
 */

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

function toDto(address: {
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
}): AddressDto {
  return {
    id: address.id,
    label: address.label,
    type: address.type,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    isDefault: address.isDefault,
  };
}

export async function listAddresses(userId: string): Promise<AddressDto[]> {
  const rows = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toDto);
}

export async function createAddress(userId: string, input: AddressInput): Promise<AddressDto> {
  const existingCount = await prisma.address.count({ where: { userId } });

  // The first address is always the default, regardless of what the client sent.
  const shouldBeDefault = input.isDefault || existingCount === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    return tx.address.create({
      data: {
        userId,
        label: input.label ?? null,
        type: input.type,
        fullName: input.fullName,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2 ?? null,
        landmark: input.landmark ?? null,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        isDefault: shouldBeDefault,
      },
    });
  });

  return toDto(created);
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressUpdateInput,
): Promise<AddressDto> {
  const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Address not found.', 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    return tx.address.update({
      where: { id: addressId },
      data: {
        label: input.label ?? existing.label,
        type: input.type ?? existing.type,
        fullName: input.fullName ?? existing.fullName,
        phone: input.phone ?? existing.phone,
        line1: input.line1 ?? existing.line1,
        line2: input.line2 ?? existing.line2,
        landmark: input.landmark ?? existing.landmark,
        city: input.city ?? existing.city,
        state: input.state ?? existing.state,
        pincode: input.pincode ?? existing.pincode,
        isDefault: input.isDefault ?? existing.isDefault,
      },
    });
  });

  return toDto(updated);
}

export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  const result = await prisma.address.deleteMany({ where: { id: addressId, userId } });

  if (result.count === 0) {
    throw new AppError('NOT_FOUND', 'Address not found.', 404);
  }

  // If the deleted address was the default, promote the newest remaining one.
  const remaining = await prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
    await prisma.address.update({
      where: { id: remaining[0]!.id },
      data: { isDefault: true },
    });
  }
}
