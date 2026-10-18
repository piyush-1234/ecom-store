import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  loginSchema,
  otpCodeSchema,
  passwordSchema,
  phoneSchema,
  registerSchema,
} from '@/lib/validators/auth';
import { addressSchema, gstStateCode, pincodeSchema } from '@/lib/validators/address';

describe('phoneSchema — Indian mobile normalisation', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['+919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['98765-43210', '+919876543210'],
  ])('normalises %s -> %s', (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it.each([
    ['5876543210', 'starts with 5'],
    ['987654321', 'only 9 digits'],
    ['98765432101', '11 digits'],
    ['abcdefghij', 'not numeric'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});

describe('pincodeSchema', () => {
  it('accepts a valid 6-digit PIN', () => {
    expect(pincodeSchema.parse('400001')).toBe('400001');
    expect(pincodeSchema.parse(' 110001 ')).toBe('110001');
  });

  it.each(['012345', '12345', '1234567', 'ABCDEF', ''])('rejects %s', (input) => {
    expect(pincodeSchema.safeParse(input).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a password with letters and a number', () => {
    expect(passwordSchema.safeParse('hunter2hunter').success).toBe(true);
  });

  it('rejects short passwords', () => {
    expect(passwordSchema.safeParse('abc1').success).toBe(false);
  });

  it('rejects all-letters passwords', () => {
    expect(passwordSchema.safeParse('onlyletters').success).toBe(false);
  });

  it('rejects all-digits passwords', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Piyush@Example.COM ')).toBe('piyush@example.com');
  });

  it('rejects invalid addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('otpCodeSchema', () => {
  it('accepts exactly 6 digits', () => {
    expect(otpCodeSchema.parse('123456')).toBe('123456');
  });

  it.each(['12345', '1234567', 'abcdef', ''])('rejects %s', (input) => {
    expect(otpCodeSchema.safeParse(input).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('defaults marketingOptIn to false', () => {
    const parsed = registerSchema.parse({
      name: 'Piyush',
      email: 'a@b.com',
      password: 'secret123',
    });
    expect(parsed.marketingOptIn).toBe(false);
  });

  it('normalises an optional phone', () => {
    const parsed = registerSchema.parse({
      name: 'Piyush',
      email: 'a@b.com',
      password: 'secret123',
      phone: '9876543210',
    });
    expect(parsed.phone).toBe('+919876543210');
  });
});

describe('loginSchema', () => {
  it('requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('addressSchema', () => {
  const valid = {
    fullName: 'Piyush Bakde',
    phone: '9876543210',
    line1: '12 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
  };

  it('accepts a complete address and applies defaults', () => {
    const parsed = addressSchema.parse(valid);
    expect(parsed.type).toBe('HOME');
    expect(parsed.isDefault).toBe(false);
    expect(parsed.phone).toBe('+919876543210');
  });

  it('rejects an unknown state', () => {
    expect(addressSchema.safeParse({ ...valid, state: 'Narnia' }).success).toBe(false);
  });

  it('rejects a short street line', () => {
    expect(addressSchema.safeParse({ ...valid, line1: 'abc' }).success).toBe(false);
  });
});

describe('gstStateCode — place of supply', () => {
  it('maps Maharashtra to 27 and Delhi to 07', () => {
    expect(gstStateCode('Maharashtra')).toBe('27');
    expect(gstStateCode('Delhi')).toBe('07');
    expect(gstStateCode('Karnataka')).toBe('29');
  });

  it('returns empty for an unknown state rather than guessing', () => {
    expect(gstStateCode('Atlantis')).toBe('');
  });
});
