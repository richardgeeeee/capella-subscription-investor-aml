import { z } from 'zod';

const paymentSchema = z.object({
  bankName: z.string().min(1, 'Required'),
  bankSwiftCode: z.string().min(1, 'Required'),
  bankAddressCountry: z.string().min(1, 'Required'),
  accountName: z.string().min(1, 'Required'),
  accountNumber: z.string().min(1, 'Required'),
});

const subscriptionSchema = z.object({
  investorName: z.string().min(1),
  subscriptionDate: z.string().min(1, 'Required'),
  subscriptionAmount: z.string().min(1, 'Required'),
});

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
  employerName: z.string().optional().default(''),
  title: z.string().optional().default(''),
  employmentPeriod: z.string().optional().default(''),
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

// Draft validation is more lenient - allows empty fields
export const draftFormSchema = z.record(z.string(), z.unknown());

export type IndividualFormValues = z.infer<typeof individualFormSchema>;
export type CorporateFormValues = z.infer<typeof corporateFormSchema>;
