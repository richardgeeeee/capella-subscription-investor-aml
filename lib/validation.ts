import { z } from 'zod';

const paymentSchema = z.object({
  bankName: z.string().min(1, 'Required'),
  bankSwiftCode: z.string().min(1, 'Required'),
  bankAddressCountry: z.string().min(1, 'Required'),
  accountName: z.string().min(1, 'Required'),
  accountNumber: z.string().min(1, 'Required'),
});

const monthEndDate = z.string().min(1, 'Required').refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return d === lastDay;
}, 'Subscription date must be the last day of a month').refine((value) => {
  const [y, m] = value.split('-').map(Number);
  const now = new Date();
  return y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth() + 1);
}, 'Subscription date cannot be in the past');

/** Accepts "100000", "100,000", "$100,000", "100000.00" etc. */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return NaN;
  return Number(cleaned);
}

const subscriptionAmount = z.string().min(1, 'Required').refine((value) => {
  const n = parseAmount(value);
  return !isNaN(n) && n >= 100_000;
}, 'Amount must be at least USD 100,000');

const subscriptionSchema = z.object({
  investorName: z.string().min(1),
  shareClass: z.string().optional().default(''),
  subscriptionDate: monthEndDate,
  subscriptionAmount,
});

export function amountQualifiesForAssetProofWaiver(raw: string | undefined): boolean {
  if (!raw) return false;
  const n = parseAmount(raw);
  return !isNaN(n) && n > 1_000_000;
}

export const individualFormSchema = subscriptionSchema.merge(paymentSchema).extend({
  dateOfBirth: z.string().min(1, 'Required'),
  cityCountryOfBirth: z.string().min(1, 'Required'),
  nationality: z.string().min(1, 'Required'),
  countryOfResidence: z.string().min(1, 'Required'),
  countryOfTaxResidency: z.string().min(1, 'Required'),
  identificationNumber: z.string().min(1, 'Required'),
  residentialAddress: z.string().min(1, 'Required'),
  phoneNumber: z.string().min(1, 'Required'),
  emailAddress: z.string().email('Invalid email'),
  sourceOfWealth: z.string().min(1, 'Required'),
  sourceOfFunds: z.string().min(1, 'Required'),
  employmentHistory: z.string().optional().default(''),
  purposeOfInvestment: z.string().min(1, 'Required'),
});

export const corporateFormSchema = subscriptionSchema.merge(paymentSchema).extend({
  dateOfFormation: z.string().min(1, 'Required'),
  jurisdiction: z.string().min(1, 'Required'),
  taxIdNumber: z.string().min(1, 'Required'),
  fiscalYearEnd: z.string().min(1, 'Required'),
  natureOfBusiness: z.string().min(1, 'Required'),
  address: z.string().min(1, 'Required'),
  phoneNumber: z.string().min(1, 'Required'),
  emailAddress: z.string().email('Invalid email'),
  sourceOfWealth: z.string().min(1, 'Required'),
  sourceOfFunds: z.string().min(1, 'Required'),
  purposeOfInvestment: z.string().min(1, 'Required'),
});

export const topupFormSchema = z.object({
  investorName: z.string().min(1),
  shareClass: z.string().optional().default(''),
  subscriptionDate: monthEndDate,
  subscriptionAmount,
});

// Draft validation is more lenient - allows empty fields
export const draftFormSchema = z.record(z.string(), z.unknown());

export type IndividualFormValues = z.infer<typeof individualFormSchema>;
export type CorporateFormValues = z.infer<typeof corporateFormSchema>;
export type TopupFormValues = z.infer<typeof topupFormSchema>;
