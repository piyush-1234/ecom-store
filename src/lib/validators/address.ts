import { z } from 'zod';
import { phoneSchema } from './auth';

/**
 * Indian states and union territories — used for the GST place-of-supply decision
 * (CGST+SGST vs IGST) and for address validation. Kept as a closed list so an
 * invalid state can never reach the invoice.
 */
export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

/**
 * GST state codes — needed on invoices. Only the codes that matter for our
 * seller + fulfilment zones are listed exhaustively here; the mapper below
 * covers all states.
 */
export const GST_STATE_CODES: Record<string, string> = {
  'Andhra Pradesh': '37',
  'Arunachal Pradesh': '12',
  Assam: '18',
  Bihar: '10',
  Chhattisgarh: '22',
  Goa: '30',
  Gujarat: '24',
  Haryana: '06',
  'Himachal Pradesh': '02',
  Jharkhand: '20',
  Karnataka: '29',
  Kerala: '32',
  'Madhya Pradesh': '23',
  Maharashtra: '27',
  Manipur: '14',
  Meghalaya: '17',
  Mizoram: '15',
  Nagaland: '13',
  Odisha: '21',
  Punjab: '03',
  Rajasthan: '08',
  Sikkim: '11',
  'Tamil Nadu': '33',
  Telangana: '36',
  Tripura: '16',
  'Uttar Pradesh': '09',
  Uttarakhand: '05',
  'West Bengal': '19',
  'Andaman and Nicobar Islands': '35',
  Chandigarh: '04',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  Delhi: '07',
  'Jammu and Kashmir': '01',
  Ladakh: '38',
  Lakshadweep: '31',
  Puducherry: '34',
};

export const ADDRESS_TYPES = ['HOME', 'WORK', 'OTHER'] as const;

/**
 * 6-digit Indian PIN code. Must not start with 0 — no PIN codes do.
 */
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  type: z.enum(ADDRESS_TYPES).default('HOME'),
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(5, 'Enter the street address').max(120),
  line2: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  state: z.enum(INDIAN_STATES),
  pincode: pincodeSchema,
  isDefault: z.boolean().default(false),
});

export const addressUpdateSchema = addressSchema.partial();

export type AddressInput = z.infer<typeof addressSchema>;
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;

export function gstStateCode(state: string): string {
  return GST_STATE_CODES[state] ?? '';
}
