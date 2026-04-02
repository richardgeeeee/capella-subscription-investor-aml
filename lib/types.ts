export type InvestorType = 'individual' | 'corporate';
export type DriveSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
export type SubmissionStatus = 'draft' | 'finalized';

export interface IndividualFormData {
  // Subscription
  investorName: string;
  subscriptionDate: string;
  subscriptionAmount: string;
  // Personal
  dateOfBirth: string;
  cityCountryOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  countryOfTaxResidency: string;
  identificationNumber: string;
  residentialAddress: string;
  phoneNumber: string;
  emailAddress: string;
  sourceOfWealth: string;
  sourceOfFunds: string;
  employerName: string;
  title: string;
  employmentPeriod: string;
  purposeOfInvestment: string;
  // Payment
  bankName: string;
  bankSwiftCode: string;
  bankAddressCountry: string;
  accountName: string;
  accountNumber: string;
}

export interface CorporateFormData {
  // Subscription
  investorName: string;
  subscriptionDate: string;
  subscriptionAmount: string;
  // Corporate
  dateOfFormation: string;
  jurisdiction: string;
  taxIdNumber: string;
  fiscalYearEnd: string;
  natureOfBusiness: string;
  address: string;
  phoneNumber: string;
  emailAddress: string;
  sourceOfWealth: string;
  sourceOfFunds: string;
  purposeOfInvestment: string;
  // Payment
  bankName: string;
  bankSwiftCode: string;
  bankAddressCountry: string;
  accountName: string;
  accountNumber: string;
}

export type FormData = IndividualFormData | CorporateFormData;

export type IndividualDocumentType =
  | 'passport_front'
  | 'passport_signature'
  | 'id_card'
  | 'address_proof'
  | 'liquid_asset_proof';

export type CorporateDocumentType =
  | 'certificate_of_incorporation'
  | 'memorandum_articles'
  | 'certificate_of_incumbency'
  | 'register_of_directors'
  | 'register_of_members'
  | 'board_resolution'
  | 'authorised_signatory_list'
  | 'investment_declaration'
  | 'org_structure_chart'
  | 'source_description'
  | 'fatca_crs_form'
  | 'audited_financial_statements'
  | 'personnel_passport_front'
  | 'personnel_passport_signature'
  | 'personnel_id_card'
  | 'personnel_address_proof';

export interface LinkInfo {
  id: string;
  token: string;
  investorName: string;
  investorType: InvestorType;
  expiresAt: string;
  isRevoked: boolean;
}

export interface UploadedFileInfo {
  id: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}
