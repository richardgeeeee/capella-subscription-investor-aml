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

/** Only digits allowed — returns integer or NaN */
function parseIntegerAmount(raw: string): number {
  if (!/^\d+$/.test(raw.trim())) return NaN;
  return Number(raw.trim());
}

const newSubscriptionAmount = z.string().min(1, 'Required').refine((value) => {
  return /^\d+$/.test(value.trim());
}, 'Must be a whole number (no decimals, commas, or symbols)').refine((value) => {
  const n = parseIntegerAmount(value);
  return !isNaN(n) && n >= 500_000;
}, 'Minimum subscription amount is USD 500,000').refine((value) => {
  const n = parseIntegerAmount(value);
  return !isNaN(n) && n % 100 === 0;
}, 'Amount must be in increments of USD 100');

const topupSubscriptionAmount = z.string().min(1, 'Required').refine((value) => {
  return /^\d+$/.test(value.trim());
}, 'Must be a whole number (no decimals, commas, or symbols)').refine((value) => {
  const n = parseIntegerAmount(value);
  return !isNaN(n) && n >= 300_000;
}, 'Minimum top-up amount is USD 300,000').refine((value) => {
  const n = parseIntegerAmount(value);
  return !isNaN(n) && n % 100 === 0;
}, 'Amount must be in increments of USD 100');

const subscriptionSchema = z.object({
  investorName: z.string().min(1),
  shareClass: z.string().optional().default(''),
  subscriptionDate: monthEndDate,
  subscriptionAmount: newSubscriptionAmount,
});

export function amountQualifiesForAssetProofWaiver(raw: string | undefined): boolean {
  if (!raw) return false;
  const n = parseIntegerAmount(raw);
  if (isNaN(n)) {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    return cleaned ? Number(cleaned) > 1_000_000 : false;
  }
  return n > 1_000_000;
}

export const individualFormSchema = subscriptionSchema.merge(paymentSchema).extend({
  legalFirstName: z.string().min(1, 'Required'),
  legalLastName: z.string().min(1, 'Required'),
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
  subscriptionAmount: topupSubscriptionAmount,
});

// Draft validation is more lenient - allows empty fields
export const draftFormSchema = z.record(z.string(), z.unknown());

export type IndividualFormValues = z.infer<typeof individualFormSchema>;
export type CorporateFormValues = z.infer<typeof corporateFormSchema>;
export type TopupFormValues = z.infer<typeof topupFormSchema>;
